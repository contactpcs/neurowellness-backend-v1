-- 003_appointment_rpcs.sql
-- Optional production-grade, idempotent helpers for the scheduler jobs.
-- The Python jobs in app/scheduler/jobs.py work without these; deploying these
-- RPCs makes reminder dispatch and request expiry atomic under concurrency
-- (safe when multiple scheduler instances briefly overlap).

-- Atomically select + stamp appointments due for a reminder, returning them.
-- lead_minutes: 1440 for the 24h reminder, 60 for the 1h reminder.
CREATE OR REPLACE FUNCTION appointments_due_for_reminder(lead_minutes INT)
RETURNS SETOF appointments
LANGUAGE plpgsql
AS $$
DECLARE
  col TEXT := CASE WHEN lead_minutes >= 1440 THEN 'reminder_24h_sent_at' ELSE 'reminder_1h_sent_at' END;
BEGIN
  RETURN QUERY EXECUTE format($f$
    UPDATE appointments a
       SET %I = NOW()
     WHERE a.status IN ('scheduled','confirmed')
       AND a.%I IS NULL
       AND a.start_at >  NOW()
       AND a.start_at <= NOW() + (%L || ' minutes')::interval
    RETURNING a.*;
  $f$, col, col, lead_minutes);
END;
$$;

-- Atomically flip expired pending requests and return them for event emission.
CREATE OR REPLACE FUNCTION expire_pending_requests()
RETURNS SETOF appointment_requests
LANGUAGE sql
AS $$
  UPDATE appointment_requests r
     SET status = 'expired', updated_at = NOW()
   WHERE r.status = 'pending'
     AND r.expires_at IS NOT NULL
     AND r.expires_at < NOW()
  RETURNING r.*;
$$;
