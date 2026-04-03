-- ============================================================================
-- MIGRATION V3: Account Automation Fields
-- ============================================================================
-- Adds automation columns to the accounts table for ORB trading.
-- ============================================================================

-- Add automation columns to accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS auto_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sessions TEXT NOT NULL DEFAULT 'both',  -- 'london', 'ny', 'both'
  ADD COLUMN IF NOT EXISTS pmt_webhook_url TEXT;

-- Add constraint for auto_sessions values
ALTER TABLE public.accounts
  ADD CONSTRAINT valid_auto_sessions
  CHECK (auto_sessions IN ('london', 'ny', 'both'));

-- Create trade_log table for detailed execution history
CREATE TABLE IF NOT EXISTS public.trade_log (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_session TEXT NOT NULL,          -- 'London' or 'NY'
  signal_direction TEXT NOT NULL,        -- 'buy' or 'sell'
  signal_entry NUMERIC,
  signal_stop NUMERIC,
  signal_target NUMERIC,
  contracts INTEGER NOT NULL DEFAULT 1,
  or_high NUMERIC,
  or_low NUMERIC,
  risk_points NUMERIC,
  reward_points NUMERIC,
  approved BOOLEAN NOT NULL DEFAULT true,
  reject_reason TEXT,
  execution_status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'filled', 'rejected', 'error'
  execution_response TEXT,
  pnl NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE
);

-- RLS: users can see their own trade logs
ALTER TABLE public.trade_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trade logs"
  ON public.trade_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (server) can insert/update any trade log (bypasses RLS)
-- The server uses the service_role key which bypasses RLS by default.
