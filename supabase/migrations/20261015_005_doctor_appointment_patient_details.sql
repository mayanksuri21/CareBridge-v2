-- CareBridge Migration: Doctor Dashboard incoming-request patient details & RLS
-- Date: 2026-10-15
-- Target: Supabase Postgres
-- Description:
--   1. Ensures demographic columns exist on public.profiles (safe if already present).
--   2. Backfills any auth.users missing a public.profiles row using OAuth/email metadata.
--   3. Adds foreign key constraint between public.appointments.patient_id and public.profiles.id
--      so PostgREST can embed patient profile data in appointment queries.
--   4. Adds a narrowly scoped RLS policy allowing doctors to SELECT the patient profile
--      (name, date_of_birth, gender, etc.) ONLY for patients who have appointments booked
--      with that authenticated doctor.
--   5. Adds an RLS policy allowing authenticated users to INSERT their own profile row
--      if the signup trigger did not run, defaulting role to 'patient'.
--   6. Updates handle_new_user() trigger function to safely seed full_name from Google OAuth
--      metadata ('full_name' or 'name') without overwriting existing patient-entered edits.
--   7. Creates public.get_doctor_appointments(): a SECURITY DEFINER function returning
--      the calling doctor's own appointments joined with patient profile demographics.

-- ----------------------------------------------------------------------------
-- 1. Ensure demographic columns exist on public.profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT;

-- ----------------------------------------------------------------------------
-- 2. Backfill missing profile rows from auth.users (idempotent)
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
-- 3. Add Foreign Key between appointments.patient_id and public.profiles.id
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_patient_id_profiles_fkey'
      AND table_schema = 'public'
      AND table_name = 'appointments'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_patient_id_profiles_fkey
      FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. RLS Policy: Allow doctors to read patient profile for their appointments
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Doctors can view patient profile for their appointments" ON public.profiles;
CREATE POLICY "Doctors can view patient profile for their appointments"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_id = public.profiles.id
        AND a.doctor_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RLS Policy: Allow users to insert their own profile row if missing
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id AND role = 'patient'
  );

-- ----------------------------------------------------------------------------
-- 6. Durable Auth Signup / Sign-in trigger with Google OAuth metadata support
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Patient'
    ),
    COALESCE(NEW.email, ''),
    'patient'
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(NULLIF(p.full_name, ''), EXCLUDED.full_name),
      email = EXCLUDED.email,
      updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7. Doctor-scoped appointment + patient details SECURITY DEFINER function
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
SET search_path = public, auth
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
    COALESCE(
      NULLIF(p.full_name, ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
      'Patient'
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
