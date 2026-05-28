-- 002_appointment_system.sql
-- Brings the appointment schema in line with the backend code (Milestone A/B).
-- The previously-applied tables (appointments, appointment_requests) had a
-- different, minimal shape and are EMPTY, so we drop and recreate them here.
-- Safe to run once in the Supabase SQL editor.

BEGIN;

-- 0. Drop the divergent, empty tables (and anything depending on them).
DROP TABLE IF EXISTS appointment_history       CASCADE;
DROP TABLE IF EXISTS appointment_requests       CASCADE;
DROP TABLE IF EXISTS appointments               CASCADE;
DROP TABLE IF EXISTS doctor_schedule_overrides  CASCADE;
DROP TABLE IF EXISTS doctor_weekly_schedules    CASCADE;

-- 1. Doctor weekly recurring schedule -----------------------------------------
CREATE TABLE doctor_weekly_schedules (
  schedule_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clinic_id              UUID NOT NULL REFERENCES clinics(clinic_id),
  day_of_week            SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun..6=Sat
  start_time             TIME NOT NULL,
  end_time               TIME NOT NULL,
  slot_duration_minutes  SMALLINT NOT NULL DEFAULT 60
                         CHECK (slot_duration_minutes IN (60, 90, 120)),
  break_start            TIME,
  break_end              TIME,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from         DATE,
  effective_until        DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dws_times CHECK (end_time > start_time),
  CONSTRAINT chk_dws_break CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (break_start IS NOT NULL AND break_end IS NOT NULL
        AND break_start >= start_time AND break_end <= end_time AND break_end > break_start)
  ),
  UNIQUE (doctor_id, day_of_week, start_time)
);
CREATE INDEX idx_dws_doctor ON doctor_weekly_schedules(doctor_id, is_active);
CREATE INDEX idx_dws_clinic ON doctor_weekly_schedules(clinic_id);

-- 2. Doctor date-level overrides ----------------------------------------------
CREATE TABLE doctor_schedule_overrides (
  override_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clinic_id     UUID NOT NULL REFERENCES clinics(clinic_id),
  override_date DATE NOT NULL,
  is_available  BOOLEAN NOT NULL DEFAULT FALSE,
  start_time    TIME,
  end_time      TIME,
  reason        TEXT,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_override_times CHECK (
    is_available = FALSE OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  UNIQUE (doctor_id, override_date)
);
CREATE INDEX idx_dso_doctor_date ON doctor_schedule_overrides(doctor_id, override_date);

-- 3. Appointment requests (created without cross-FKs; added after appointments)
CREATE TABLE appointment_requests (
  request_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id               UUID REFERENCES clinics(clinic_id),
  patient_id              UUID NOT NULL REFERENCES profiles(id),
  doctor_id               UUID NOT NULL REFERENCES profiles(id),
  request_type            TEXT NOT NULL DEFAULT 'new' CHECK (request_type IN ('new','reschedule')),
  parent_appointment_id   UUID,
  preferred_date_1        DATE NOT NULL,
  preferred_date_2        DATE,
  preferred_date_3        DATE,
  preferred_time_window   TEXT NOT NULL DEFAULT 'any'
                          CHECK (preferred_time_window IN ('morning','afternoon','evening','any')),
  patient_complaint       TEXT NOT NULL,
  reason                  TEXT,
  urgency                 TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','urgent','emergency')),
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','cancelled_by_patient','expired')),
  approved_appointment_id UUID,
  reviewed_by             UUID REFERENCES profiles(id),
  reviewed_at             TIMESTAMPTZ,
  review_notes            TEXT,
  expires_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_reschedule_has_parent CHECK (
    request_type = 'new' OR (request_type = 'reschedule' AND parent_appointment_id IS NOT NULL)
  )
);
CREATE INDEX idx_apt_req_clinic_status  ON appointment_requests(clinic_id, status, created_at DESC);
CREATE INDEX idx_apt_req_patient        ON appointment_requests(patient_id, created_at DESC);
CREATE INDEX idx_apt_req_doctor         ON appointment_requests(doctor_id);
CREATE INDEX idx_apt_req_pending_expiry ON appointment_requests(expires_at) WHERE status = 'pending';
CREATE UNIQUE INDEX uq_apt_req_one_pending_reschedule
  ON appointment_requests(parent_appointment_id)
  WHERE status = 'pending' AND request_type = 'reschedule';

-- 4. Appointments -------------------------------------------------------------
CREATE TABLE appointments (
  appointment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              UUID REFERENCES clinics(clinic_id),
  patient_id             UUID NOT NULL REFERENCES profiles(id),
  doctor_id              UUID NOT NULL REFERENCES profiles(id),
  booked_by              UUID NOT NULL REFERENCES profiles(id),
  booked_by_role         TEXT NOT NULL CHECK (booked_by_role IN ('doctor','receptionist','clinical_assistant','admin')),
  appointment_request_id UUID REFERENCES appointment_requests(request_id),
  appointment_date       DATE NOT NULL,
  start_time             TIME NOT NULL,
  end_time               TIME NOT NULL,
  start_at               TIMESTAMPTZ NOT NULL,
  end_at                 TIMESTAMPTZ NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled','confirmed','checked_in','in_progress',
                                           'completed','cancelled','no_show','rescheduled')),
  appointment_type       TEXT NOT NULL DEFAULT 'consultation'
                         CHECK (appointment_type IN ('consultation','follow_up','assessment','emergency','video')),
  reason                 TEXT,
  notes                  TEXT,
  patient_complaint      TEXT,
  cancellation_reason    TEXT,
  cancelled_by           UUID REFERENCES profiles(id),
  cancelled_at           TIMESTAMPTZ,
  rescheduled_from       UUID REFERENCES appointments(appointment_id),
  rescheduled_to         UUID REFERENCES appointments(appointment_id),
  session_id             UUID REFERENCES sessions(id),
  reminder_24h_sent_at   TIMESTAMPTZ,
  reminder_1h_sent_at    TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_apt_times CHECK (end_time > start_time),
  CONSTRAINT uq_doctor_slot UNIQUE (doctor_id, appointment_date, start_time)
);
CREATE INDEX idx_apt_doctor_date  ON appointments(doctor_id, appointment_date) WHERE status NOT IN ('cancelled','no_show');
CREATE INDEX idx_apt_patient_date ON appointments(patient_id, appointment_date);
CREATE INDEX idx_apt_clinic_date  ON appointments(clinic_id, appointment_date);
CREATE INDEX idx_apt_status       ON appointments(status);
CREATE INDEX idx_apt_start_at     ON appointments(start_at);
CREATE INDEX idx_apt_request      ON appointments(appointment_request_id);

-- 5. Add the cross-FKs back onto appointment_requests -------------------------
ALTER TABLE appointment_requests
  ADD CONSTRAINT fk_apt_req_parent   FOREIGN KEY (parent_appointment_id)   REFERENCES appointments(appointment_id),
  ADD CONSTRAINT fk_apt_req_approved FOREIGN KEY (approved_appointment_id) REFERENCES appointments(appointment_id);

-- 6. Append-only audit log ----------------------------------------------------
CREATE TABLE appointment_history (
  history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('appointment','request')),
  entity_id       UUID NOT NULL,
  action          TEXT NOT NULL,
  old_status      TEXT,
  new_status      TEXT,
  changed_by      UUID,
  changed_by_role TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'::jsonb,
  notes           TEXT
);
CREATE INDEX idx_apt_hist_entity ON appointment_history(entity_type, entity_id, changed_at DESC);

-- 7. Link clinical sessions to appointments -----------------------------------
ALTER TABLE sessions DROP COLUMN IF EXISTS appointment_id;
ALTER TABLE sessions ADD  COLUMN appointment_id UUID REFERENCES appointments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_appointment ON sessions(appointment_id);

-- 8. RLS (defense-in-depth; backend uses the service key which bypasses RLS) --
ALTER TABLE appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_weekly_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_history       ENABLE ROW LEVEL SECURITY;

CREATE POLICY apt_patient_select ON appointments FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY apt_doctor_select  ON appointments FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY apt_staff_select   ON appointments FOR SELECT USING (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('receptionist','clinical_assistant','admin') AND p.clinic_id = appointments.clinic_id));

CREATE POLICY apt_req_patient_select ON appointment_requests FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY apt_req_staff_select   ON appointment_requests FOR SELECT USING (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('receptionist','clinical_assistant','doctor','admin') AND p.clinic_id = appointment_requests.clinic_id));

CREATE POLICY sched_owner_select ON doctor_weekly_schedules FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY sched_staff_select ON doctor_weekly_schedules FOR SELECT USING (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('receptionist','clinical_assistant','admin') AND p.clinic_id = doctor_weekly_schedules.clinic_id));

CREATE POLICY override_owner_select ON doctor_schedule_overrides FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY override_staff_select ON doctor_schedule_overrides FOR SELECT USING (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('receptionist','clinical_assistant','admin') AND p.clinic_id = doctor_schedule_overrides.clinic_id));

COMMIT;
