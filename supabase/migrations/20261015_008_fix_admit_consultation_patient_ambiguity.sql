-- CareBridge Migration: fix "column reference \"appointment_id\" is ambiguous"
-- Date: 2026-10-15
-- Target: Supabase Postgres
--
-- PROBLEM
--   public.admit_consultation_patient(UUID) was declared as:
--       RETURNS TABLE (appointment_id UUID, admitted_at TIMESTAMPTZ)
--   In plpgsql, RETURNS TABLE(...) declares OUT parameters, which become
--   variables in the function body. `appointment_id` therefore existed as BOTH
--   a plpgsql variable and a column of public.consultation_admissions, so the
--   unqualified reference inside `ON CONFLICT (appointment_id)` could not be
--   resolved by the parser:
--       ERROR: 42702: column reference "appointment_id" is ambiguous
--   The function could never complete an insert, so no patient could be admitted.
--
-- FIX
--   1. Renamed the OUT parameters so they can no longer collide with any table
--      column (appointment_id/admitted_at -> admitted_appointment_id/admitted_at_utc).
--   2. Qualified every table reference with an explicit alias (a, da, ca).
--   3. Kept the ON CONFLICT (appointment_id) column form, which is now
--      unambiguous because no variable of that name exists any more.
--
-- SECURITY: unchanged. Same SECURITY DEFINER body and the same checks:
--   caller is authenticated, is the appointment's assigned doctor, is an
--   approved doctor, the appointment is confirmed, and the current time is
--   inside the consultation window. RLS and grants are untouched.
--
-- The returned column names changed (admitted_appointment_id, admitted_at_utc).
-- Safe: the only caller is src/app/api/consultation/admit/route.js, which
-- forwards the rows without reading their keys, and the consultation page only
-- inspects the HTTP status / error message.
--
-- Safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.admit_consultation_patient(p_appointment_id UUID)
RETURNS TABLE (admitted_appointment_id UUID, admitted_at_utc TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_appt         RECORD;
  v_is_approved  BOOLEAN;
  v_admitted_at  TIMESTAMPTZ;
  -- Kept in sync with src/app/api/consultation/token/route.js
  c_grace_before CONSTANT INTERVAL := INTERVAL '15 minutes';
  c_grace_after  CONSTANT INTERVAL := INTERVAL '30 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  SELECT a.id, a.patient_id, a.doctor_id, a.status, a.starts_at, a.ends_at
    INTO v_appt
  FROM public.appointments AS a
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
    SELECT 1
    FROM public.doctor_applications AS da
    WHERE da.user_id = v_uid
      AND da.status = 'approved'
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
  INSERT INTO public.consultation_admissions AS ca (
    appointment_id, patient_id, doctor_id, admitted_by, admitted_at
  )
  VALUES (
    p_appointment_id, v_appt.patient_id, v_appt.doctor_id, v_uid, timezone('utc'::text, now())
  )
  ON CONFLICT (appointment_id) DO UPDATE
    SET admitted_by = EXCLUDED.admitted_by,
        admitted_at = EXCLUDED.admitted_at
  RETURNING ca.admitted_at INTO v_admitted_at;

  RETURN QUERY SELECT p_appointment_id, v_admitted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_consultation_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admit_consultation_patient(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Manual verification (run in the Supabase SQL Editor after applying)
-- ----------------------------------------------------------------------------
-- 1. Confirm the new signature / OUT parameter names:
--    SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
--           pg_get_function_result(p.oid) AS result
--      FROM pg_proc p
--     WHERE p.pronamespace = 'public'::regnamespace
--       AND p.proname = 'admit_consultation_patient';
--    Expect args   = p_appointment_id uuid
--           result = TABLE(admitted_appointment_id uuid, admitted_at_utc timestamp with time zone)
--
-- 2. Confirm no plpgsql variable still shadows a column (should return 0 rows):
--    SELECT p.proname
--      FROM pg_proc p
--     WHERE p.pronamespace = 'public'::regnamespace
--       AND p.proname = 'admit_consultation_patient'
--       AND pg_get_function_result(p.oid) LIKE '%appointment_id uuid%';
--
-- 3. End-to-end (as the assigned, approved doctor, inside the window):
--    SELECT * FROM public.admit_consultation_patient('<appointment-uuid>');
--    Expect one row, not error 42702.
