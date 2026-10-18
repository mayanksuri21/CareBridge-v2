-- CareBridge Migration: Agent Runs Table for TinyFish Integration
-- Date: 2026-10-18
-- Purpose: Track TinyFish agent runs for credential verification and price finding

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('credential', 'price')),
  subject_key TEXT NOT NULL,
  site TEXT,
  tinyfish_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  result JSONB,
  error TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_kind ON public.agent_runs(kind);
CREATE INDEX IF NOT EXISTS idx_agent_runs_subject_key ON public.agent_runs(subject_key);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tinyfish_run_id ON public.agent_runs(tinyfish_run_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON public.agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON public.agent_runs(created_at);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_agent_runs_updated_at ON public.agent_runs;
CREATE TRIGGER trg_agent_runs_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Users can view their own runs
DROP POLICY IF EXISTS "Users can view own agent runs" ON public.agent_runs;
CREATE POLICY "Users can view own agent runs"
  ON public.agent_runs FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Users can insert their own runs
DROP POLICY IF EXISTS "Users can insert own agent runs" ON public.agent_runs;
CREATE POLICY "Users can insert own agent runs"
  ON public.agent_runs FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Admins can manage all agent runs
DROP POLICY IF EXISTS "Admins can manage agent runs" ON public.agent_runs;
CREATE POLICY "Admins can manage agent runs"
  ON public.agent_runs FOR ALL
  TO authenticated
  USING (public.is_admin());
