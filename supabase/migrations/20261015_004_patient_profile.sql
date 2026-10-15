-- CareBridge Phase 07 Migration: Patient Profile page support
-- Date: 2026-10-15
-- Target: Supabase Postgres
-- Description:
--   1. Idempotently ensures patient demographic columns exist on public.profiles
--      (date_of_birth, gender, state, district) — a safe no-op if already present.
--   2. Makes profile edits durable: the auth signup trigger no longer overwrites a
--      patient's edited full_name on later auth.users updates (sign-in updates
--      last_sign_in_at, which fired the trigger and reverted the name). The name is
--      only seeded when empty; email is kept in sync.
--
-- Safety notes:
--   * Does NOT recreate the profiles table and never overwrites column data.
--   * Existing RLS already restricts profiles SELECT/UPDATE to the owner (and admins)
--     and blocks role escalation via the UPDATE WITH CHECK clause, so no policy
--     changes are required here.

-- ----------------------------------------------------------------------------
-- 1. Ensure patient demographic columns exist
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT;

-- ----------------------------------------------------------------------------
-- 2. Durable profile name (do not clobber patient edits on auth updates)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    'patient' -- Default to patient; doctors are promoted only via admin approval
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
