-- CareBridge Phase 05 Migration: Doctor Schedules, Leaves, Profile Updates & Safe Doctor Directory
-- Date: 2026-10-15
-- Target: Supabase Postgres
-- Description:
--   1. Adds patient profile demographic columns: date_of_birth, gender, state, district.
--   2. Creates public.doctor_schedules and public.doctor_leaves tables with RLS and updated_at triggers.
--   3. Adds overlap-prevention trigger for doctor schedules.
--   4. Adds update protection on public.doctor_applications so non-admin doctors can only edit safe fields.
--   5. Creates patient-safe SECURITY DEFINER function public.get_approved_doctors() and public.get_approved_doctor_by_id(uuid).

-- ----------------------------------------------------------------------------
-- 1. Patient Profile Demographics Columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT;

-- ----------------------------------------------------------------------------
-- 2. Doctor Schedules Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_mins SMALLINT NOT NULL DEFAULT 15
    CHECK (slot_duration_mins IN (10, 15, 20, 30, 45, 60)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor ON public.doctor_schedules(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_day ON public.doctor_schedules(day_of_week);

-- ----------------------------------------------------------------------------
-- 3. Doctor Leaves Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_start DATE NOT NULL,
  leave_end DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (leave_end >= leave_start)
);

CREATE INDEX IF NOT EXISTS idx_doctor_leaves_doctor ON public.doctor_leaves(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_leaves_dates ON public.doctor_leaves(leave_start, leave_end);

-- ----------------------------------------------------------------------------
-- 4. Overlap Prevention Trigger for Doctor Schedules
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_doctor_schedule_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only validate active shifts
  IF NEW.is_active = true THEN
    IF EXISTS (
      SELECT 1 FROM public.doctor_schedules
      WHERE doctor_id = NEW.doctor_id
        AND day_of_week = NEW.day_of_week
        AND is_active = true
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        -- Overlap check: NOT (new_end <= existing_start OR new_start >= existing_end)
        AND (NEW.start_time < end_time AND NEW.end_time > start_time)
    ) THEN
      RAISE EXCEPTION 'Shift overlaps with an existing active shift on this day for this doctor.'
        USING ERRCODE = '23P01'; -- exclusion_violation
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_doctor_schedule_overlap ON public.doctor_schedules;
CREATE TRIGGER trg_check_doctor_schedule_overlap
  BEFORE INSERT OR UPDATE ON public.doctor_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_doctor_schedule_overlap();

-- ----------------------------------------------------------------------------
-- 5. Updated-At Trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_schedules_updated_at ON public.doctor_schedules;
CREATE TRIGGER trg_doctor_schedules_updated_at
  BEFORE UPDATE ON public.doctor_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_doctor_leaves_updated_at ON public.doctor_leaves;
CREATE TRIGGER trg_doctor_leaves_updated_at
  BEFORE UPDATE ON public.doctor_leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security for Doctor Schedules & Leaves
-- ----------------------------------------------------------------------------
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;

-- 6.1 Doctor Schedules Policies
DROP POLICY IF EXISTS "Doctors can manage own schedules" ON public.doctor_schedules;
CREATE POLICY "Doctors can manage own schedules"
  ON public.doctor_schedules FOR ALL
  TO authenticated
  USING (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  )
  WITH CHECK (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  );

DROP POLICY IF EXISTS "Authenticated users read approved doctor schedules" ON public.doctor_schedules;
CREATE POLICY "Authenticated users read approved doctor schedules"
  ON public.doctor_schedules FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    doctor_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.doctor_applications
      WHERE user_id = doctor_schedules.doctor_id AND status = 'approved'
    )
  );

-- 6.2 Doctor Leaves Policies
DROP POLICY IF EXISTS "Doctors can manage own leaves" ON public.doctor_leaves;
CREATE POLICY "Doctors can manage own leaves"
  ON public.doctor_leaves FOR ALL
  TO authenticated
  USING (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  )
  WITH CHECK (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  );

DROP POLICY IF EXISTS "Authenticated users read approved doctor leaves" ON public.doctor_leaves;
CREATE POLICY "Authenticated users read approved doctor leaves"
  ON public.doctor_leaves FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    doctor_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.doctor_applications
      WHERE user_id = doctor_leaves.doctor_id AND status = 'approved'
    )
  );

-- ----------------------------------------------------------------------------
-- 7. Doctor Profile Editing Security (Safe fields only)
-- ----------------------------------------------------------------------------
-- Doctors can update only safe fields: bio, consultation_fee, consultation_languages, phone, experience_years.
-- A trigger strictly prevents altering protected fields (status, registration_number, issuing_council,
-- qualification, institution, full_name, user_id, reviewed_by, reviewed_at, review_notes) unless the user is an admin.

CREATE OR REPLACE FUNCTION public.check_doctor_application_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If administrator, permit full updates
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Ensure caller is the owner
  IF auth.uid() <> OLD.user_id THEN
    RAISE EXCEPTION 'Unauthorized to modify this doctor record.' USING ERRCODE = '42501';
  END IF;

  -- Protect critical credentials from self-modification
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Doctors cannot modify application status.' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot modify owner user_id.' USING ERRCODE = '42501';
  END IF;

  IF NEW.registration_number IS DISTINCT FROM OLD.registration_number THEN
    RAISE EXCEPTION 'Registration number cannot be changed without admin re-verification.' USING ERRCODE = '42501';
  END IF;

  IF NEW.issuing_council IS DISTINCT FROM OLD.issuing_council THEN
    RAISE EXCEPTION 'Issuing council cannot be changed without admin re-verification.' USING ERRCODE = '42501';
  END IF;

  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION 'Doctor full name cannot be changed without admin re-verification.' USING ERRCODE = '42501';
  END IF;

  IF NEW.qualification IS DISTINCT FROM OLD.qualification THEN
    RAISE EXCEPTION 'Qualifications cannot be changed without admin re-verification.' USING ERRCODE = '42501';
  END IF;

  IF NEW.institution IS DISTINCT FROM OLD.institution THEN
    RAISE EXCEPTION 'Institution cannot be changed without admin re-verification.' USING ERRCODE = '42501';
  END IF;

  IF NEW.specialization IS DISTINCT FROM OLD.specialization THEN
    RAISE EXCEPTION 'Specialization cannot be changed without admin re-verification.' USING ERRCODE = '42501';
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR
     NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
     NEW.review_notes IS DISTINCT FROM OLD.review_notes THEN
    RAISE EXCEPTION 'Review audit fields cannot be changed by applicant.' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_doctor_application_update ON public.doctor_applications;
CREATE TRIGGER trg_check_doctor_application_update
  BEFORE UPDATE ON public.doctor_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.check_doctor_application_update();

-- Update policy to permit approved doctors to update safe fields of their row
DROP POLICY IF EXISTS "Doctors can update safe profile fields" ON public.doctor_applications;
CREATE POLICY "Doctors can update safe profile fields"
  ON public.doctor_applications FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- ----------------------------------------------------------------------------
-- 8. Patient-Safe Doctor Directory Function
-- ----------------------------------------------------------------------------
-- Patients must not read doctor_applications directly (holds private email, phone, documents, notes).
-- This SECURITY DEFINER function returns only approved doctors with public fields.

CREATE OR REPLACE FUNCTION public.get_approved_doctors()
RETURNS TABLE (
  doctor_id UUID,
  full_name TEXT,
  specialization TEXT,
  qualification TEXT,
  institution TEXT,
  experience_years INTEGER,
  consultation_languages TEXT[],
  consultation_fee NUMERIC(10, 2),
  bio TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    da.user_id AS doctor_id,
    da.full_name,
    da.specialization,
    da.qualification,
    da.institution,
    da.experience_years,
    da.consultation_languages,
    da.consultation_fee,
    da.bio
  FROM public.doctor_applications da
  WHERE da.status = 'approved'
  ORDER BY da.full_name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_approved_doctors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_doctors() TO authenticated;

-- Function to get a single approved doctor by user_id
CREATE OR REPLACE FUNCTION public.get_approved_doctor_by_id(target_doctor_id UUID)
RETURNS TABLE (
  doctor_id UUID,
  full_name TEXT,
  specialization TEXT,
  qualification TEXT,
  institution TEXT,
  experience_years INTEGER,
  consultation_languages TEXT[],
  consultation_fee NUMERIC(10, 2),
  bio TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    da.user_id AS doctor_id,
    da.full_name,
    da.specialization,
    da.qualification,
    da.institution,
    da.experience_years,
    da.consultation_languages,
    da.consultation_fee,
    da.bio
  FROM public.doctor_applications da
  WHERE da.user_id = target_doctor_id AND da.status = 'approved'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_approved_doctor_by_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_doctor_by_id(UUID) TO authenticated;
