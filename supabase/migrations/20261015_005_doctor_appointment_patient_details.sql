-- CareBridge Migration: Doctor Dashboard incoming-request patient details
-- Date: 2026-10-15
-- Target: Supabase Postgres
-- Description:
--   1. Backfills any auth.users that are missing a public.profiles row (idempotent,
--      never creates duplicates). Fixes "details missing because the profile row
--      was never created".
--   2. Adds public.get_doctor_appointments(): a SECURITY DEFINER function that returns
--      ONLY the calling doctor's own appointments, joined with the patient profile
--      (appointments.patient_id = profiles.id), exposing just the safe fields the
--      doctor dashboard needs: full_name, date_of_birth, gender.
--
-- Why an RPC: appointments.patient_id references auth.users (there is NO foreign key
-- named appointments_patient_id_fkey to public.profiles), so PostgREST resource
-- embedding cannot join profiles. Additionally, public.profiles RLS allows only the
-- owner (and admins) to SELECT, so a doctor cannot read a patient's profile directly.
-- A SECURITY DEFINER function keeps RLS intact and returns only safe fields for the
-- authenticated doctor's own appointments.

-- ----------------------------------------------------------------------------
-- 1. Backfill missing profile rows (idempotent; skips existing ids)
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, email, role)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    'Patient'
  ),
  COALESCE(u.email, ''),
  'patient'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Doctor-scoped appointment + patient details function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_doctor_appointments()
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  doctor_id UUID,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT,
  reason TEXT,
  fee_at_booking NUMERIC(10, 2),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  cancelled_by UUID,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  patient_name TEXT,
  patient_date_of_birth DATE,
  patient_gender TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.id,
    a.patient_id,
    a.doctor_id,
    a.starts_at,
    a.ends_at,
    a.status,
    a.reason,
    a.fee_at_booking,
    a.decided_by,
    a.decided_at,
    a.decision_note,
    a.cancelled_by,
    a.cancelled_at,
    a.created_at,
    a.updated_at,
    -- Prefer the profile name; fall back to auth metadata, then the email local part.
    COALESCE(
      NULLIF(p.full_name, ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), '')
    ) AS patient_name,
    p.date_of_birth AS patient_date_of_birth,
    p.gender AS patient_gender
  FROM public.appointments a
  LEFT JOIN public.profiles p ON p.id = a.patient_id
  LEFT JOIN auth.users u ON u.id = a.patient_id
  WHERE a.doctor_id = auth.uid()
  ORDER BY a.starts_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_doctor_appointments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_appointments() TO authenticated;
