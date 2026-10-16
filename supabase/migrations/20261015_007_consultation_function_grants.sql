-- CareBridge Migration: lock down EXECUTE on consultation SECURITY DEFINER functions
-- Date: 2026-10-15
-- Target: Supabase Postgres
--
-- WHY
-- ---
-- Migration 20261015_006_consultation_waiting_room_notifications.sql ends each
-- function with:
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION ... TO authenticated;
--
-- On Supabase that is not sufficient. The project's default privileges grant
-- EXECUTE directly to the `anon` role for every new function created in schema
-- public, and `REVOKE ... FROM PUBLIC` does not remove a *direct* grant to anon.
-- A live probe using the publishable (anon) key confirmed the functions were
-- still reachable:
--
--   ensure_consultation_reminders()   -> executed (SECURITY DEFINER INSERT)
--   dismiss_patient_notification(uuid)-> executed (no rows matched: auth.uid() NULL)
--   admit_consultation_patient(uuid)  -> executed, then raised our own
--                                        'Authentication required.' (ERRCODE 28000)
--
-- Impact is limited because every function re-checks auth.uid() internally, and
-- Row Level Security on all four tables correctly returned zero rows for anon.
-- `ensure_consultation_reminders()` is nevertheless an unauthenticated write
-- path (it inserts reminder rows for other patients), so it is closed here.
--
-- SCOPE
-- -----
-- Only EXECUTE grants change. `authenticated` keeps EXECUTE, so the application
-- is unaffected. No table, RLS policy, function body, or row is modified.
-- Idempotent / safe to re-run.

REVOKE EXECUTE ON FUNCTION public.admit_consultation_patient(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_consultation_reminders() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dismiss_patient_notification(UUID) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.admit_consultation_patient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_consultation_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_patient_notification(UUID) TO authenticated;
