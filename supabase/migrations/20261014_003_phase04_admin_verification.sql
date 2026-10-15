-- CareBridge Migration: Phase 04 Admin Authorization & Storage Signed URL RLS
-- Date: 2026-10-14
-- Purpose:
-- 1. Ensure public.is_admin() is robust, STABLE, and uses SECURITY DEFINER with search_path=public.
-- 2. Ensure only administrators can update doctor_applications and profiles roles.
-- 3. Ensure administrators can view all doctor_documents and read objects in 'doctor-credentials' bucket.
-- 4. Ensure doctor applicants can only select their own application and doctor_documents.

-- Re-verify is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.administrators
    WHERE user_id = auth.uid()
  );
$$;

-- Ensure profiles view policy: Users see own, Admins see all
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- Ensure admin manage profile policy
DROP POLICY IF EXISTS "Admins can manage any profile" ON public.profiles;
CREATE POLICY "Admins can manage any profile"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Ensure doctor applications view policy
DROP POLICY IF EXISTS "Doctors view own application or admin views all" ON public.doctor_applications;
CREATE POLICY "Doctors view own application or admin views all"
  ON public.doctor_applications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Ensure admin update application policy
DROP POLICY IF EXISTS "Admins can update application decisions" ON public.doctor_applications;
CREATE POLICY "Admins can update application decisions"
  ON public.doctor_applications FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ensure doctor documents view policy
DROP POLICY IF EXISTS "Doctors view own documents or admin views all" ON public.doctor_documents;
CREATE POLICY "Doctors view own documents or admin views all"
  ON public.doctor_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Storage bucket: doctor-credentials (private)
-- Ensure admin can read doctor credentials for signed URL generation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "Doctors can read own credentials or admin reads all" ON storage.objects;
    CREATE POLICY "Doctors can read own credentials or admin reads all"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'doctor-credentials' AND
        (
          (storage.foldername(name))[1] = auth.uid()::text OR
          public.is_admin()
        )
      );
  END IF;
END $$;
