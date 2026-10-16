-- CareBridge Migration: secure consultation waiting room + patient reminders
-- Date: 2026-10-15
-- Target: Supabase Postgres
--
-- Adds ONLY what is required for the LiveKit consultation phase:
--   1. public.consultation_admissions — server-enforced admission state
--      (the patient cannot enter the active room until the assigned, verified
--      doctor admits them). No client INSERT/UPDATE/DELETE policies exist.
--   2. public.admit_consultation_patient(uuid) — SECURITY DEFINER RPC that
--      validates caller = assigned doctor, doctor approved, appointment
--      confirmed and inside the consultation window. Idempotent.
--   3. public.patient_notifications — persisted consultation reminders.
--      UNIQUE (appointment_id, type) guarantees no duplicate reminders.
--   4. public.ensure_consultation_reminders() — idempotent reminder generator
--      (used both on-demand when the patient opens the portal and by cron).
--   5. public.dismiss_patient_notification(uuid) — lets a patient dismiss
--      only their own notification (read_at), nothing else.
--   6. Supabase Realtime publication for patient_notifications (if available).
--   7. Optional pg_cron schedule so reminders are created even when the
--      patient's browser is closed.
--
-- Safe to re-run (idempotent).

-- ----------------------------------------------------------------------------
-- 1. Consultation admissions (waiting-room state)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultation_admissions (
  appointment_id UUID PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admitted_by UUID NOT NULL REFERENCES auth.users(id),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_consultation_admissions_patient
  ON public.consultation_admissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_admissions_doctor
  ON public.consultation_admissions(doctor_id);

ALTER TABLE public.consultation_admissions ENABLE ROW LEVEL SECURITY;

-- Participants may only read admission rows for their own appointments.
DROP POLICY IF EXISTS "Patients can view own consultation admissions" ON public.consultation_admissions;
CREATE POLICY "Patients can view own consultation admissions"
  ON public.consultation_admissions FOR SELECT
  TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view own consultation admissions" ON public.consultation_admissions;
CREATE POLICY "Doctors can view own consultation admissions"
  ON public.consultation_admissions FOR SELECT
  TO authenticated
  USING (doctor_id = auth.uid());

-- Deliberately NO INSERT / UPDATE / DELETE policies: admission can only be
-- granted through public.admit_consultation_patient() below.

-- ----------------------------------------------------------------------------
-- 2. admit_consultation_patient — the only way to admit a patient
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admit_consultation_patient(p_appointment_id UUID)
RETURNS TABLE (appointment_id UUID, admitted_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_appt RECORD;
  v_is_approved BOOLEAN;
  v_admitted_at TIMESTAMPTZ;
  -- Kept in sync with src/app/api/consultation/token/route.js
  c_grace_before CONSTANT INTERVAL := INTERVAL '15 minutes';
  c_grace_after CONSTANT INTERVAL := INTERVAL '30 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  SELECT a.id, a.patient_id, a.doctor_id, a.status, a.starts_at, a.ends_at
    INTO v_appt
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Only the assigned doctor may admit (never the patient, never another doctor).
  IF v_appt.doctor_id <> v_uid THEN
    RAISE EXCEPTION 'Only the assigned doctor can admit this patient.' USING ERRCODE = '42501';
  END IF;

  -- The doctor must be verified/approved.
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_applications da
    WHERE da.user_id = v_uid AND da.status = 'approved'
  ) INTO v_is_approved;

  IF NOT v_is_approved THEN
    RAISE EXCEPTION 'Only verified doctors can admit patients.' USING ERRCODE = '42501';
  END IF;

  IF v_appt.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Appointment is not confirmed.' USING ERRCODE = 'P0001';
  END IF;

  IF now() < v_appt.starts_at - c_grace_before THEN
    RAISE EXCEPTION 'Consultation has not started yet.' USING ERRCODE = 'P0001';
  END IF;

  IF now() > v_appt.ends_at + c_grace_after THEN
    RAISE EXCEPTION 'Consultation window has ended.' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: repeated clicks / refreshes simply refresh the timestamp.
  INSERT INTO public.consultation_admissions (
    appointment_id, patient_id, doctor_id, admitted_by, admitted_at
  )
  VALUES (
    p_appointment_id, v_appt.patient_id, v_appt.doctor_id, v_uid, timezone('utc'::text, now())
  )
  ON CONFLICT (appointment_id) DO UPDATE
    SET admitted_by = EXCLUDED.admitted_by,
        admitted_at = EXCLUDED.admitted_at
  RETURNING consultation_admissions.admitted_at INTO v_admitted_at;

  RETURN QUERY SELECT p_appointment_id, v_admitted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_consultation_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admit_consultation_patient(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Patient notifications (persisted consultation reminders)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('consultation_reminder')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  doctor_name TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- One reminder per appointment per type => no duplicates on refresh.
  UNIQUE (appointment_id, type)
);

CREATE INDEX IF NOT EXISTS idx_patient_notifications_patient
  ON public.patient_notifications(patient_id, created_at DESC);

ALTER TABLE public.patient_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own notifications" ON public.patient_notifications;
CREATE POLICY "Patients can view own notifications"
  ON public.patient_notifications FOR SELECT
  TO authenticated
  USING (patient_id = auth.uid());

-- No client INSERT/UPDATE/DELETE policies: rows are created by the
-- SECURITY DEFINER function below and dismissed via
-- public.dismiss_patient_notification().

-- ----------------------------------------------------------------------------
-- 4. ensure_consultation_reminders — idempotent reminder creation
-- ----------------------------------------------------------------------------
-- Creates a reminder row for every confirmed appointment whose start is within
-- the next 15 minutes and returns the caller's notifications.
-- Safe to call from the patient portal (returns only the caller's rows) and
-- from cron (creates rows for every patient).
CREATE OR REPLACE FUNCTION public.ensure_consultation_reminders()
RETURNS SETOF public.patient_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.patient_notifications (
    patient_id, appointment_id, type, title, body, doctor_name, starts_at
  )
  SELECT
    a.patient_id,
    a.id,
    'consultation_reminder',
    'Consultation reminder',
    'Your consultation with '
      || COALESCE(NULLIF(da.full_name, ''), 'your doctor')
      || ' starts in 15 minutes. Please get ready and keep your camera and microphone available.',
    COALESCE(NULLIF(da.full_name, ''), 'your doctor'),
    a.starts_at
  FROM public.appointments a
  LEFT JOIN public.doctor_applications da
    ON da.user_id = a.doctor_id AND da.status = 'approved'
  WHERE a.status = 'confirmed'
    AND a.starts_at > now()
    AND a.starts_at <= now() + INTERVAL '15 minutes'
  ON CONFLICT (appointment_id, type) DO NOTHING;

  RETURN QUERY
    SELECT n.* FROM public.patient_notifications n
    WHERE n.patient_id = auth.uid()
    ORDER BY n.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_consultation_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_consultation_reminders() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. dismiss_patient_notification — patient can only touch their own row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_patient_notification(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.patient_notifications
     SET read_at = timezone('utc'::text, now())
   WHERE id = p_id
     AND patient_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.dismiss_patient_notification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_patient_notification(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Realtime publication (adds push delivery for new reminders)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'patient_notifications'
     )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_notifications';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication update skipped: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Optional scheduled job so reminders exist even when the portal is closed
--    (requires the pg_cron extension; skipped safely when unavailable)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $job$
      SELECT cron.schedule(
        'carebridge-consultation-reminders',
        '* * * * *',
        $cron$SELECT public.ensure_consultation_reminders();$cron$
      );
    $job$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;
