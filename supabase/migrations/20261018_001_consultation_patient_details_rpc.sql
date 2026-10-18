-- CareBridge Consultation: Patient Details RPC for Doctor
-- Date: 2026-10-18
-- Target: Supabase Postgres
-- Description:
--   Creates a SECURITY DEFINER function to fetch patient details for a consultation.
--   This allows doctors to view patient profiles for their appointments, bypassing RLS.
--   Only the assigned doctor or the patient themselves can access the data.

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER Function: get_consultation_patient_details
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_consultation_patient_details(p_appointment_id UUID)
RETURNS TABLE (
  full_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_doctor_id UUID;
  v_caller_id UUID;
BEGIN
  -- Get the authenticated user
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- Fetch appointment details
  SELECT patient_id, doctor_id INTO v_patient_id, v_doctor_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: only the assigned doctor or the patient
  IF v_caller_id <> v_patient_id AND v_caller_id <> v_doctor_id THEN
    RAISE EXCEPTION 'Not authorized to view patient details.' USING ERRCODE = '42501';
  END IF;

  -- Return patient profile
  RETURN QUERY
  SELECT
    p.full_name,
    p.date_of_birth,
    p.gender,
    p.phone
  FROM public.profiles p
  WHERE p.id = v_patient_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_consultation_patient_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consultation_patient_details(UUID) TO authenticated;
