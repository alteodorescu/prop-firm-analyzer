-- Prop Firm Analyzer Supabase Schema
-- Complete database schema with Row Level Security (RLS) policies
-- All data is user-scoped and secured with RLS

-- Enable UUID extension for auth.users reference
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE: firms
-- ============================================================================
-- Stores proprietary trading firm data
-- Each firm record belongs to a single user

CREATE TABLE IF NOT EXISTS public.firms (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic firm info
  name TEXT NOT NULL,
  model TEXT,
  cost NUMERIC DEFAULT 0,
  reset_cost TEXT,  -- NUMERIC or "na" — stored as text for flexibility
  max_nq NUMERIC,
  instant BOOLEAN NOT NULL DEFAULT false,

  -- Challenge parameters (nullable for instant funded firms)
  pt NUMERIC,
  mll NUMERIC,
  mll_type TEXT DEFAULT 'static' CHECK (mll_type IS NULL OR mll_type IN ('static', 'eod', 'intraday')),
  dll NUMERIC,
  consistency NUMERIC CHECK (consistency IS NULL OR (consistency >= 0 AND consistency <= 1)),
  min_days INTEGER,
  min_profit NUMERIC,

  -- Funded parameters
  f_mll NUMERIC,
  f_mll_type TEXT DEFAULT 'static' CHECK (f_mll_type IS NULL OR f_mll_type IN ('static', 'eod', 'intraday')),
  f_dll NUMERIC,
  f_consistency NUMERIC CHECK (f_consistency IS NULL OR (f_consistency >= 0 AND f_consistency <= 1)),
  f_min_days INTEGER,
  f_min_profit NUMERIC,

  -- Account management
  activation NUMERIC DEFAULT 0,
  buffer NUMERIC DEFAULT 0,
  split NUMERIC DEFAULT 1 CHECK (split IS NULL OR (split >= 0 AND split <= 1)),
  withdrawal_pct NUMERIC DEFAULT 1 CHECK (withdrawal_pct IS NULL OR (withdrawal_pct >= 0 AND withdrawal_pct <= 1)),

  -- Complex nested data as JSONB
  scaling_chal JSONB DEFAULT '[]'::jsonb,  -- Array of {upTo, contracts}
  scaling_fund JSONB DEFAULT '[]'::jsonb,  -- Array of {upTo, contracts}
  payout_tiers JSONB DEFAULT '[]'::jsonb,  -- Array of {min, max}
  special_rules TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_firms_user_id ON public.firms(user_id);

-- RLS Policy: Enable RLS on firms table
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own firms
CREATE POLICY "Users can view their own firms"
  ON public.firms
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own firms
CREATE POLICY "Users can insert their own firms"
  ON public.firms
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own firms
CREATE POLICY "Users can update their own firms"
  ON public.firms
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own firms
CREATE POLICY "Users can delete their own firms"
  ON public.firms
  FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================================
-- TABLE: accounts
-- ============================================================================
-- Stores trading account data linked to firms
-- Each account belongs to a user and references a firm

CREATE TABLE IF NOT EXISTS public.accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id BIGINT NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,

  -- Account info
  label TEXT,
  phase TEXT NOT NULL DEFAULT 'challenge' CHECK (phase IN ('challenge', 'funded')),
  start_balance NUMERIC NOT NULL DEFAULT 50000,
  start_date TEXT,  -- ISO date string to match app format
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  -- Complex nested data as JSONB
  journal JSONB DEFAULT '[]'::jsonb,  -- Array of {date, balance, pnl, trades, flags, notes}
  payouts JSONB DEFAULT '[]'::jsonb,  -- Array of {date, amount, newBalance, id}
  resets JSONB DEFAULT '[]'::jsonb,   -- Array of {date, cost, id}

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX idx_accounts_firm_id ON public.accounts(firm_id);

-- RLS Policy: Enable RLS on accounts table
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own accounts
CREATE POLICY "Users can view their own accounts"
  ON public.accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own accounts
CREATE POLICY "Users can insert their own accounts"
  ON public.accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own accounts
CREATE POLICY "Users can update their own accounts"
  ON public.accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own accounts
CREATE POLICY "Users can delete their own accounts"
  ON public.accounts
  FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================================
-- TABLE: user_preferences
-- ============================================================================
-- Stores user-specific application preferences

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Preferences
  dark_mode BOOLEAN NOT NULL DEFAULT false,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ro')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RLS Policy: Enable RLS on user_preferences table
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own preferences
CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own preferences
CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own preferences
CREATE POLICY "Users can delete their own preferences"
  ON public.user_preferences
  FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================================
-- FUNCTION: update_updated_at_column
-- ============================================================================
-- Trigger function to automatically update the updated_at timestamp

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- TRIGGERS: Automatic updated_at updates
-- ============================================================================
-- Create triggers for each table to update updated_at automatically

CREATE TRIGGER update_firms_updated_at BEFORE UPDATE ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- NOTES ON DATA MIGRATION
-- ============================================================================
-- When migrating from localStorage to Supabase:
--
-- 1. FIRMS TABLE:
--    - localStorage key: 'propFirmAnalyzerData'
--    - Each firm object from the array becomes a row
--    - The authenticated user_id is added during migration
--
-- 2. ACCOUNTS TABLE:
--    - localStorage key: 'propFirmTrackerAccounts'
--    - Each account object from the array becomes a row
--    - The firm_id is matched via the firms relationship
--    - The authenticated user_id is added during migration
--
-- 3. USER PREFERENCES TABLE:
--    - Check localStorage for 'darkMode' and 'language' keys
--    - Create a user_preferences record with these values
--    - Defaults: darkMode = false, language = 'en'
--
-- 4. JSONB FIELDS:
--    - Ensure all complex nested structures (journal, payouts, resets,
--      scaling_chal, scaling_fund, payout_tiers) are properly serialized
--      as valid JSON before insertion
