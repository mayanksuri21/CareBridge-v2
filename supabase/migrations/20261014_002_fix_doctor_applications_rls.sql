-- CareBridge Migration: Fix Doctor Application RLS Insert Policy
-- Date: 2026-10-14
-- Purpose:
-- 1. Ensure authenticated users can submit doctor applications with strict status='pending' enforcement.
-- 2. Prevent users from self-approving or tampering with review fields upon creation.
-- 3. Ensure doctors and admins have correct SELECT access to newly inserted application records (.select('id').single()).

-- Drop existing INSERT policy if present
DROP POLICY IF EXISTS "Users can submit doctor application" ON public.doctor_applications;

-- Recreate INSERT policy with explicit status check
-- - Restricts role to authenticated sessions (auth.uid() IS NOT NULL)
-- - Enforces that the row's user_id matches the authenticated user's ID
-- - Enforces that initial application status is strictly 'pending'
-- - Enforces that reviewed_by and reviewed_at are NULL at insertion time
CREATE POLICY "Users can submit doctor application"
  ON public.doctor_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    status = 'pending' AND
    reviewed_by IS NULL AND
    reviewed_at IS NULL
  );

-- Re-verify SELECT policy for doctor_applications to ensure applicants can query their inserted application
DROP POLICY IF EXISTS "Doctors view own application or admin views all" ON public.doctor_applications;

CREATE POLICY "Doctors view own application or admin views all"
  ON public.doctor_applications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR public.is_admin()
  );
