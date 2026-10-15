-- CareBridge Phase 02 Schema: Authentication, Profiles, Doctor Applications & Role Security

-- 1. Custom Types
CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE doctor_app_status AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');

-- 2. Profiles Table (1-to-1 with auth.users)
-- Tracks fundamental account identity and verified system role.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'patient',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for lookup
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- 3. Administrators Table (Strict Separate Table for Admin Authorization)
-- Protects against accidental escalation or client metadata tampering.
CREATE TABLE public.administrators (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Doctor Applications & Verified Credentials Table
CREATE TABLE public.doctor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  qualification TEXT NOT NULL,
  institution TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  issuing_council TEXT NOT NULL,
  specialization TEXT NOT NULL,
  experience_years INTEGER NOT NULL CHECK (experience_years >= 0),
  consultation_languages TEXT[] NOT NULL DEFAULT '{}',
  consultation_fee NUMERIC(10, 2) NOT NULL CHECK (consultation_fee >= 0),
  bio TEXT,
  status doctor_app_status NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_doctor_user_app UNIQUE (user_id),
  CONSTRAINT unique_doctor_reg_no UNIQUE (registration_number)
);

CREATE INDEX idx_doctor_apps_status ON public.doctor_applications(status);
CREATE INDEX idx_doctor_apps_user ON public.doctor_applications(user_id);

-- 5. Doctor Documents (Private credential documents in Supabase Storage)
CREATE TABLE public.doctor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.doctor_applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- e.g., 'nmc_certificate', 'degree', 'government_id'
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_doctor_docs_app ON public.doctor_documents(application_id);
CREATE INDEX idx_doctor_docs_user ON public.doctor_documents(user_id);

-- 6. Helper Security Functions (SECURITY DEFINER)
-- Checks if current authenticated session is an administrator
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

-- Checks if current authenticated session is an approved doctor
CREATE OR REPLACE FUNCTION public.is_approved_doctor()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_applications
    WHERE user_id = auth.uid() AND status = 'approved'
  );
$$;

-- 7. Trigger to handle profile creation on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'patient' -- Default to patient; doctors are promoted only via verified admin application approval
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;

-- 8.1 PROFILES Policies
-- Users can view their own profile; admins can view all profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- Users can update non-critical fields of their own profile (name, phone, language)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND 
    role = (SELECT role FROM public.profiles WHERE id = auth.uid()) -- Prevents self-escalating role
  );

-- Admins can update any profile (e.g. deactivate account or promote role)
CREATE POLICY "Admins can manage any profile"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_admin());

-- 8.2 ADMINISTRATORS Policies
-- Only authenticated admins can read admin table
CREATE POLICY "Admins can view admin list"
  ON public.administrators FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 8.3 DOCTOR APPLICATIONS Policies
-- Doctors can view their own application; Admins can view all applications
CREATE POLICY "Doctors view own application or admin views all"
  ON public.doctor_applications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Authenticated users can insert their own application
CREATE POLICY "Users can submit doctor application"
  ON public.doctor_applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Doctors can update their own application ONLY if changes were requested or still pending
CREATE POLICY "Doctors can update pending application"
  ON public.doctor_applications FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND status IN ('pending', 'changes_requested')
  )
  WITH CHECK (
    auth.uid() = user_id AND 
    status = (SELECT status FROM public.doctor_applications WHERE user_id = auth.uid()) -- Doctor cannot self-approve
  );

-- Admins can update any application (approve, reject, request changes)
CREATE POLICY "Admins can update application decisions"
  ON public.doctor_applications FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8.4 DOCTOR DOCUMENTS Policies
-- Doctors view own documents; Admins view all
CREATE POLICY "Doctors view own documents or admin views all"
  ON public.doctor_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Doctors can upload their own documents
CREATE POLICY "Doctors upload own documents"
  ON public.doctor_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can delete or manage documents if necessary
CREATE POLICY "Admins manage documents"
  ON public.doctor_documents FOR ALL
  TO authenticated
  USING (public.is_admin());

-- 9. Storage Setup Instructions & Storage Bucket Policies
-- (Bucket name: 'doctor-credentials', private: true)
-- Run inside Supabase SQL editor:
/*
INSERT INTO storage.buckets (id, name, public) 
VALUES ('doctor-credentials', 'doctor-credentials', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated doctors can upload credentials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'doctor-credentials' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

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
*/
