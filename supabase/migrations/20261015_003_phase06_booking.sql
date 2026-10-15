-- ============================================================================
-- CareBridge Phase 06 Migration: Appointments, Booking Engine & Doctor Directory
-- Date: 2026-10-15
-- Target: Supabase Postgres
-- Description:
--   1. Ensures doctor_schedules and doctor_leaves tables exist with RLS.
--   2. Creates public.appointments table with RLS, partial unique index, and range overlap triggers.
--   3. Creates SECURITY DEFINER functions:
--      - public.get_approved_doctors()
--      - public.get_available_slots(p_doctor_id, p_from, p_to)
--      - public.book_appointment(p_doctor_id, p_starts_at, p_reason)
--      - public.respond_to_appointment(p_id, p_action, p_note)
--      - public.cancel_appointment(p_id)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure doctor_schedules and doctor_leaves Exist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sun, 1 = Mon, ..., 6 = Sat
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

ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;

-- Schedule RLS policies
DROP POLICY IF EXISTS "Doctors manage their own schedules" ON public.doctor_schedules;
CREATE POLICY "Doctors manage their own schedules"
  ON public.doctor_schedules FOR ALL
  TO authenticated
  USING (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  )
  WITH CHECK (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  );

DROP POLICY IF EXISTS "Authenticated users can read approved doctor schedules" ON public.doctor_schedules;
CREATE POLICY "Authenticated users can read approved doctor schedules"
  ON public.doctor_schedules FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.doctor_applications da
      WHERE da.user_id = doctor_schedules.doctor_id AND da.status = 'approved'
    )
  );

-- Leave RLS policies
DROP POLICY IF EXISTS "Doctors manage their own leaves" ON public.doctor_leaves;
CREATE POLICY "Doctors manage their own leaves"
  ON public.doctor_leaves FOR ALL
  TO authenticated
  USING (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  )
  WITH CHECK (
    doctor_id = auth.uid() AND (public.is_approved_doctor() OR public.is_admin())
  );

DROP POLICY IF EXISTS "Authenticated users can read approved doctor leaves" ON public.doctor_leaves;
CREATE POLICY "Authenticated users can read approved doctor leaves"
  ON public.doctor_leaves FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.doctor_applications da
      WHERE da.user_id = doctor_leaves.doctor_id AND da.status = 'approved'
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Appointments Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  reason TEXT CHECK (char_length(reason) <= 500),
  fee_at_booking NUMERIC(10, 2),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  cancelled_by UUID REFERENCES auth.users(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (ends_at > starts_at),
  CHECK (patient_id <> doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_starts ON public.appointments(starts_at);

-- Partial Unique Index on (doctor_id, starts_at) for active appointments
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_starts_at_active
  ON public.appointments(doctor_id, starts_at)
  WHERE status IN ('requested', 'confirmed');

-- Range overlap trigger for doctor and patient
CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only validate active states
  IF NEW.status IN ('requested', 'confirmed') THEN
    -- Check doctor overlapping range
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE doctor_id = NEW.doctor_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status IN ('requested', 'confirmed')
        AND (NEW.starts_at < ends_at AND NEW.ends_at > starts_at)
    ) THEN
      RAISE EXCEPTION 'Doctor already has an active appointment overlapping this time slot.'
        USING ERRCODE = '23P01';
    END IF;

    -- Check patient overlapping range
    IF EXISTS (
      SELECT 1 FROM public.appointments
      WHERE patient_id = NEW.patient_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status IN ('requested', 'confirmed')
        AND (NEW.starts_at < ends_at AND NEW.ends_at > starts_at)
    ) THEN
      RAISE EXCEPTION 'Patient already has an active appointment overlapping this time slot.'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_appointment_overlap ON public.appointments;
CREATE TRIGGER trg_check_appointment_overlap
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_appointment_overlap();

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Row Level Security for Appointments
-- ----------------------------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Patients can select only their own appointments
DROP POLICY IF EXISTS "Patients can select own appointments" ON public.appointments;
CREATE POLICY "Patients can select own appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (patient_id = auth.uid());

-- Doctors can select only appointments booked with them
DROP POLICY IF EXISTS "Doctors can select their doctor appointments" ON public.appointments;
CREATE POLICY "Doctors can select their doctor appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (doctor_id = auth.uid());

-- Admins can select all appointments
DROP POLICY IF EXISTS "Admins can select all appointments" ON public.appointments;
CREATE POLICY "Admins can select all appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- No direct client INSERT / UPDATE / DELETE policies are granted.
-- All writes must go through the SECURITY DEFINER functions below.

-- ----------------------------------------------------------------------------
-- 4. Safe Approved Doctors Directory Function
-- ----------------------------------------------------------------------------
-- Returns only approved doctors without leaking email, phone, registration number, documents, or review notes.
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
  bio TEXT,
  issuing_council TEXT
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
    da.bio,
    da.issuing_council
  FROM public.doctor_applications da
  WHERE da.status = 'approved'
  ORDER BY da.full_name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_approved_doctors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_doctors() TO authenticated;

-- Single approved doctor view
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
  bio TEXT,
  issuing_council TEXT
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
    da.bio,
    da.issuing_council
  FROM public.doctor_applications da
  WHERE da.user_id = target_doctor_id AND da.status = 'approved'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_approved_doctor_by_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_doctor_by_id(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Slot Generation Function: public.get_available_slots
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_doctor_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS TABLE (
  slot_start TIMESTAMPTZ,
  slot_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_approved BOOLEAN;
  v_today_ist DATE;
  v_effective_from DATE;
  v_effective_to DATE;
  v_cur_date DATE;
  v_cur_dow INTEGER;
  v_sched RECORD;
  v_shift_start_ts TIMESTAMPTZ;
  v_shift_end_ts TIMESTAMPTZ;
  v_slot_start_ts TIMESTAMPTZ;
  v_slot_end_ts TIMESTAMPTZ;
  v_earliest_allowed_ts TIMESTAMPTZ;
BEGIN
  -- 1. Check if target doctor is approved
  SELECT (status = 'approved') INTO v_is_approved
  FROM public.doctor_applications
  WHERE user_id = p_doctor_id;

  IF v_is_approved IS NOT TRUE THEN
    RETURN;
  END IF;

  -- 2. Determine bounds in Asia/Kolkata timezone
  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_earliest_allowed_ts := now() + interval '30 minutes';

  v_effective_from := GREATEST(COALESCE(p_from, v_today_ist), v_today_ist);
  -- Strictly limit date range to 14 days
  v_effective_to := LEAST(COALESCE(p_to, v_today_ist + 13), v_effective_from + 13, v_today_ist + 13);

  IF v_effective_from > v_effective_to THEN
    RETURN;
  END IF;

  -- 3. Loop through each date in the window
  v_cur_date := v_effective_from;
  WHILE v_cur_date <= v_effective_to LOOP
    -- Day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat
    v_cur_dow := EXTRACT(DOW FROM v_cur_date)::integer;

    -- Check if doctor is on leave on this date
    IF NOT EXISTS (
      SELECT 1 FROM public.doctor_leaves
      WHERE doctor_id = p_doctor_id
        AND v_cur_date BETWEEN leave_start AND leave_end
    ) THEN
      -- Loop through active schedules for this day of week
      FOR v_sched IN
        SELECT start_time, end_time, slot_duration_mins
        FROM public.doctor_schedules
        WHERE doctor_id = p_doctor_id
          AND day_of_week = v_cur_dow
          AND is_active = true
        ORDER BY start_time ASC
      LOOP
        -- Construct TIMESTAMPTZ in Asia/Kolkata
        v_shift_start_ts := (v_cur_date::text || ' ' || v_sched.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
        v_shift_end_ts := (v_cur_date::text || ' ' || v_sched.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';

        v_slot_start_ts := v_shift_start_ts;
        WHILE (v_slot_start_ts + (v_sched.slot_duration_mins || ' minutes')::interval) <= v_shift_end_ts LOOP
          v_slot_end_ts := v_slot_start_ts + (v_sched.slot_duration_mins || ' minutes')::interval;

          -- Must start at least 30 minutes in the future
          IF v_slot_start_ts >= v_earliest_allowed_ts THEN
            -- Check if already booked with requested or confirmed appointment
            IF NOT EXISTS (
              SELECT 1 FROM public.appointments
              WHERE doctor_id = p_doctor_id
                AND status IN ('requested', 'confirmed')
                AND (v_slot_start_ts < ends_at AND v_slot_end_ts > starts_at)
            ) THEN
              slot_start := v_slot_start_ts;
              slot_end := v_slot_end_ts;
              RETURN NEXT;
            END IF;
          END IF;

          v_slot_start_ts := v_slot_end_ts;
        END LOOP;
      END LOOP;
    END IF;

    v_cur_date := v_cur_date + 1;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Booking Function: public.book_appointment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_doctor_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_is_approved BOOLEAN;
  v_doc_fee NUMERIC(10, 2);
  v_slot_date DATE;
  v_slot_dow INTEGER;
  v_sched RECORD;
  v_shift_start_ts TIMESTAMPTZ;
  v_shift_end_ts TIMESTAMPTZ;
  v_candidate_start TIMESTAMPTZ;
  v_candidate_end TIMESTAMPTZ;
  v_found_slot BOOLEAN := false;
  v_ends_at TIMESTAMPTZ;
  v_new_id UUID;
  v_today_ist DATE;
BEGIN
  -- Authenticated caller only
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to book an appointment.' USING ERRCODE = '42501';
  END IF;

  IF v_caller_id = p_doctor_id THEN
    RAISE EXCEPTION 'You cannot book an appointment with yourself.' USING ERRCODE = '23514';
  END IF;

  -- Verify doctor is approved
  SELECT (status = 'approved'), consultation_fee INTO v_is_approved, v_doc_fee
  FROM public.doctor_applications
  WHERE user_id = p_doctor_id;

  IF v_is_approved IS NOT TRUE THEN
    RAISE EXCEPTION 'Selected doctor is not verified or currently unavailable for booking.' USING ERRCODE = 'P0001';
  END IF;

  -- Enforce 30 mins future requirement
  IF p_starts_at < (now() + interval '30 minutes') THEN
    RAISE EXCEPTION 'Appointments must be booked at least 30 minutes in advance.' USING ERRCODE = 'P0001';
  END IF;

  -- Enforce 14 days maximum advance window
  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_slot_date := (p_starts_at AT TIME ZONE 'Asia/Kolkata')::date;
  IF v_slot_date > (v_today_ist + 13) THEN
    RAISE EXCEPTION 'Appointments can only be scheduled within the next 14 days.' USING ERRCODE = 'P0001';
  END IF;

  -- Check if doctor is on leave on this slot date
  IF EXISTS (
    SELECT 1 FROM public.doctor_leaves
    WHERE doctor_id = p_doctor_id
      AND v_slot_date BETWEEN leave_start AND leave_end
  ) THEN
    RAISE EXCEPTION 'Doctor is on scheduled leave during this date.' USING ERRCODE = 'P0001';
  END IF;

  -- Validate slot matches active doctor schedule exactly
  v_slot_dow := EXTRACT(DOW FROM v_slot_date)::integer;

  FOR v_sched IN
    SELECT start_time, end_time, slot_duration_mins
    FROM public.doctor_schedules
    WHERE doctor_id = p_doctor_id
      AND day_of_week = v_slot_dow
      AND is_active = true
    ORDER BY start_time ASC
  LOOP
    v_shift_start_ts := (v_slot_date::text || ' ' || v_sched.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
    v_shift_end_ts := (v_slot_date::text || ' ' || v_sched.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';

    v_candidate_start := v_shift_start_ts;
    WHILE (v_candidate_start + (v_sched.slot_duration_mins || ' minutes')::interval) <= v_shift_end_ts LOOP
      v_candidate_end := v_candidate_start + (v_sched.slot_duration_mins || ' minutes')::interval;

      IF v_candidate_start = p_starts_at THEN
        v_found_slot := true;
        v_ends_at := v_candidate_end;
        EXIT;
      END IF;

      v_candidate_start := v_candidate_end;
    END LOOP;

    IF v_found_slot THEN
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_found_slot THEN
    RAISE EXCEPTION 'The requested time does not align with any valid consultation slot.' USING ERRCODE = 'P0001';
  END IF;

  -- Check doctor double booking
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND status IN ('requested', 'confirmed')
      AND (p_starts_at < ends_at AND v_ends_at > starts_at)
  ) THEN
    RAISE EXCEPTION 'This slot was just booked by another patient. Please choose another time.' USING ERRCODE = '23P01';
  END IF;

  -- Check patient overlapping appointment
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE patient_id = v_caller_id
      AND status IN ('requested', 'confirmed')
      AND (p_starts_at < ends_at AND v_ends_at > starts_at)
  ) THEN
    RAISE EXCEPTION 'You already have an active appointment scheduled during this time window.' USING ERRCODE = '23P01';
  END IF;

  -- Insert appointment
  INSERT INTO public.appointments (
    patient_id,
    doctor_id,
    starts_at,
    ends_at,
    status,
    reason,
    fee_at_booking
  ) VALUES (
    v_caller_id,
    p_doctor_id,
    p_starts_at,
    v_ends_at,
    'requested',
    SUBSTRING(TRIM(p_reason) FROM 1 FOR 500),
    COALESCE(v_doc_fee, 0)
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Doctor Response Function: public.respond_to_appointment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_appointment(
  p_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_appt RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'Action must be either "confirmed" or "declined".' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'declined' AND (p_note IS NULL OR LENGTH(TRIM(p_note)) = 0) THEN
    RAISE EXCEPTION 'A note is required when declining an appointment.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment record not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Only the assigned doctor or admin can respond
  IF v_appt.doctor_id <> v_caller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only the assigned doctor can respond to this request.' USING ERRCODE = '42501';
  END IF;

  IF v_appt.status <> 'requested' THEN
    RAISE EXCEPTION 'Only appointments in "requested" status can be confirmed or declined (current: %).', v_appt.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
  SET
    status = p_action,
    decided_by = v_caller_id,
    decided_at = timezone('utc'::text, now()),
    decision_note = TRIM(p_note),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_appointment(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_appointment(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Cancellation Function: public.cancel_appointment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_appt RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment record not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Patient, Doctor or Admin
  IF v_appt.patient_id <> v_caller_id AND v_appt.doctor_id <> v_caller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized to cancel this appointment.' USING ERRCODE = '42501';
  END IF;

  IF v_appt.status NOT IN ('requested', 'confirmed') THEN
    RAISE EXCEPTION 'Only appointments with status "requested" or "confirmed" can be cancelled (current: %).', v_appt.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.starts_at <= now() THEN
    RAISE EXCEPTION 'Cannot cancel an appointment that has already started or passed.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancelled_by = v_caller_id,
    cancelled_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(UUID) TO authenticated;
