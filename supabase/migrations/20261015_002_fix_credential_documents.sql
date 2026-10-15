-- CareBridge Phase 05: Fix Credential Documents Storage & Metadata RLS
-- Date: 2026-10-15
-- Target: Supabase Postgres
-- Purpose:
--   1. Ensures the private 'doctor-credentials' storage bucket exists.
--   2. Enforces storage RLS:
--      - Doctors can upload & read files only in their own folder (auth.uid() = first folder segment).
--      - Admins (public.is_admin()) can select/read all files in 'doctor-credentials'.
--   3. Enforces public.doctor_documents RLS:
--      - Applicants can insert & select only their own document rows.
--      - Admins can select all rows.
--      - Updates to storage_path or document_type are locked.
--   4. Provides a backfill function to populate missing doctor_documents from storage if objects exist.

-- 1. Ensure private 'doctor-credentials' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('doctor-credentials', 'doctor-credentials', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Storage Policies for 'doctor-credentials'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    -- Drop old policies
    DROP POLICY IF EXISTS "Authenticated doctors can upload credentials" ON storage.objects;
    DROP POLICY IF EXISTS "Doctors can upload own credentials" ON storage.objects;
    DROP POLICY IF EXISTS "Doctors can read own credentials or admin reads all" ON storage.objects;

    -- Doctors can upload credentials only into their own folder (named with their auth.uid())
    CREATE POLICY "Doctors can upload own credentials"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'doctor-credentials' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

    -- Doctors can read their own files; Admins can read all files
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

-- 3. Table Policies for public.doctor_documents
ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors view own documents or admin views all" ON public.doctor_documents;
CREATE POLICY "Doctors view own documents or admin views all"
  ON public.doctor_documents FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Doctors upload own documents" ON public.doctor_documents;
CREATE POLICY "Doctors upload own documents"
  ON public.doctor_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
  );

-- Lock updates on doctor_documents to prevent tampering with file paths
DROP POLICY IF EXISTS "No updates on doctor documents" ON public.doctor_documents;
CREATE POLICY "Admins can delete documents"
  ON public.doctor_documents FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
  );

-- 4. Backfill Function: Sync Storage Objects to doctor_documents for Approved / Existing Doctors
CREATE OR REPLACE FUNCTION public.backfill_doctor_documents_from_storage()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  -- Only admin can run backfill
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT
      o.id AS object_id,
      o.name AS storage_path,
      (storage.foldername(o.name))[1]::uuid AS user_id,
      storage.filename(o.name) AS file_name,
      o.metadata->>'mimetype' AS mime_type,
      COALESCE((o.metadata->>'size')::integer, 0) AS file_size,
      da.id AS application_id,
      CASE
        WHEN o.name ILIKE '%degree%' THEN 'degree_certificate'
        ELSE 'registration_certificate'
      END AS document_type
    FROM storage.objects o
    JOIN public.doctor_applications da ON da.user_id = (storage.foldername(o.name))[1]::uuid
    WHERE o.bucket_id = 'doctor-credentials'
      AND NOT EXISTS (
        SELECT 1 FROM public.doctor_documents dd
        WHERE dd.storage_path = o.name
      )
  LOOP
    INSERT INTO public.doctor_documents (
      application_id,
      user_id,
      document_type,
      storage_path,
      file_name,
      file_size,
      mime_type
    ) VALUES (
      r.application_id,
      r.user_id,
      r.document_type,
      r.storage_path,
      r.file_name,
      r.file_size,
      COALESCE(r.mime_type, 'application/pdf')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_doctor_documents_from_storage() TO authenticated;
