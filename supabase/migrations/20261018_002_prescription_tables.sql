-- CareBridge Phase: Prescription and Clinical Notes Tables
-- Date: 2026-10-18
-- Target: Supabase Postgres
-- Description:
--   Creates tables for prescriptions, prescription items, and clinical notes.
--   Enables doctors to save prescriptions with medicines during consultations.
--   Patients can view their finalized prescriptions.

-- ----------------------------------------------------------------------------
-- 1. Clinical Notes Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clinical_notes_appointment ON public.clinical_notes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON public.clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_doctor ON public.clinical_notes(doctor_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_clinical_notes_updated_at ON public.clinical_notes;
CREATE TRIGGER trg_clinical_notes_updated_at
  BEFORE UPDATE ON public.clinical_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Prescriptions Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized')),
  clinical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON public.prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON public.prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON public.prescriptions(status);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_prescriptions_updated_at ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Prescription Items Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  strength TEXT,
  dose TEXT,
  frequency TEXT,
  duration TEXT,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription ON public.prescription_items(prescription_id);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security for Clinical Notes
-- ----------------------------------------------------------------------------
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;

-- Patients can select their own clinical notes
DROP POLICY IF EXISTS "Patients can select own clinical notes" ON public.clinical_notes;
CREATE POLICY "Patients can select own clinical notes"
  ON public.clinical_notes FOR SELECT
  TO authenticated
  USING (patient_id = auth.uid());

-- Doctors can select clinical notes for their appointments
DROP POLICY IF EXISTS "Doctors can select clinical notes for their appointments" ON public.clinical_notes;
CREATE POLICY "Doctors can select clinical notes for their appointments"
  ON public.clinical_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = clinical_notes.appointment_id
        AND a.doctor_id = auth.uid()
    )
  );

-- Doctors can insert clinical notes for their appointments
DROP POLICY IF EXISTS "Doctors can insert clinical notes for their appointments" ON public.clinical_notes;
CREATE POLICY "Doctors can insert clinical notes for their appointments"
  ON public.clinical_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    doctor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = clinical_notes.appointment_id
        AND a.doctor_id = auth.uid()
    )
  );

-- Doctors can update clinical notes for their appointments
DROP POLICY IF EXISTS "Doctors can update clinical notes for their appointments" ON public.clinical_notes;
CREATE POLICY "Doctors can update clinical notes for their appointments"
  ON public.clinical_notes FOR UPDATE
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Admins can manage all clinical notes
DROP POLICY IF EXISTS "Admins can manage clinical notes" ON public.clinical_notes;
CREATE POLICY "Admins can manage clinical notes"
  ON public.clinical_notes FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. Row Level Security for Prescriptions
-- ----------------------------------------------------------------------------
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- Patients can select their own prescriptions
DROP POLICY IF EXISTS "Patients can select own prescriptions" ON public.prescriptions;
CREATE POLICY "Patients can select own prescriptions"
  ON public.prescriptions FOR SELECT
  TO authenticated
  USING (patient_id = auth.uid());

-- Doctors can select prescriptions for their appointments
DROP POLICY IF EXISTS "Doctors can select prescriptions for their appointments" ON public.prescriptions;
CREATE POLICY "Doctors can select prescriptions for their appointments"
  ON public.prescriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = prescriptions.appointment_id
        AND a.doctor_id = auth.uid()
    )
  );

-- Doctors can insert prescriptions for their appointments
DROP POLICY IF EXISTS "Doctors can insert prescriptions for their appointments" ON public.prescriptions;
CREATE POLICY "Doctors can insert prescriptions for their appointments"
  ON public.prescriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    doctor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = prescriptions.appointment_id
        AND a.doctor_id = auth.uid()
    )
  );

-- Doctors can update prescriptions for their appointments
DROP POLICY IF EXISTS "Doctors can update prescriptions for their appointments" ON public.prescriptions;
CREATE POLICY "Doctors can update prescriptions for their appointments"
  ON public.prescriptions FOR UPDATE
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Doctors can finalize prescriptions for their appointments
DROP POLICY IF EXISTS "Doctors can finalize prescriptions for their appointments" ON public.prescriptions;
CREATE POLICY "Doctors can finalize prescriptions for their appointments"
  ON public.prescriptions FOR UPDATE
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (
    doctor_id = auth.uid() AND
    (status = 'finalized' AND finalized_at IS NOT NULL OR status = 'draft')
  );

-- Admins can manage all prescriptions
DROP POLICY IF EXISTS "Admins can manage prescriptions" ON public.prescriptions;
CREATE POLICY "Admins can manage prescriptions"
  ON public.prescriptions FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. Row Level Security for Prescription Items
-- ----------------------------------------------------------------------------
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

-- Patients can select prescription items through their prescriptions
DROP POLICY IF EXISTS "Patients can select own prescription items" ON public.prescription_items;
CREATE POLICY "Patients can select own prescription items"
  ON public.prescription_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.patient_id = auth.uid()
    )
  );

-- Doctors can select prescription items for their prescriptions
DROP POLICY IF EXISTS "Doctors can select prescription items for their prescriptions" ON public.prescription_items;
CREATE POLICY "Doctors can select prescription items for their prescriptions"
  ON public.prescription_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.doctor_id = auth.uid()
    )
  );

-- Doctors can insert prescription items for their prescriptions
DROP POLICY IF EXISTS "Doctors can insert prescription items for their prescriptions" ON public.prescription_items;
CREATE POLICY "Doctors can insert prescription items for their prescriptions"
  ON public.prescription_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.doctor_id = auth.uid()
    )
  );

-- Doctors can update prescription items for their prescriptions
DROP POLICY IF EXISTS "Doctors can update prescription items for their prescriptions" ON public.prescription_items;
CREATE POLICY "Doctors can update prescription items for their prescriptions"
  ON public.prescription_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.doctor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.doctor_id = auth.uid()
    )
  );

-- Doctors can delete prescription items for their prescriptions
DROP POLICY IF EXISTS "Doctors can delete prescription items for their prescriptions" ON public.prescription_items;
CREATE POLICY "Doctors can delete prescription items for their prescriptions"
  ON public.prescription_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.doctor_id = auth.uid()
    )
  );

-- Admins can manage all prescription items
DROP POLICY IF EXISTS "Admins can manage prescription items" ON public.prescription_items;
CREATE POLICY "Admins can manage prescription items"
  ON public.prescription_items FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. Function to update finalized_at when status changes to finalized
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_prescription_finalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalized' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.status IS NULL) THEN
    NEW.finalized_at = timezone('utc'::text, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prescription_finalization ON public.prescriptions;
CREATE TRIGGER trg_prescription_finalization
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_prescription_finalization();
