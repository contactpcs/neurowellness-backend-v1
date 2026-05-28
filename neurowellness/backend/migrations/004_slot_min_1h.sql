-- 004_slot_min_1h.sql
-- Tightens slot duration: minimum 1 hour. Allowed: 60, 90, 120 minutes.
-- Run once in the Supabase SQL editor.

ALTER TABLE doctor_weekly_schedules
  DROP CONSTRAINT IF EXISTS doctor_weekly_schedules_slot_duration_minutes_check;

ALTER TABLE doctor_weekly_schedules
  ADD  CONSTRAINT doctor_weekly_schedules_slot_duration_minutes_check
  CHECK (slot_duration_minutes IN (60, 90, 120));

ALTER TABLE doctor_weekly_schedules
  ALTER COLUMN slot_duration_minutes SET DEFAULT 60;
