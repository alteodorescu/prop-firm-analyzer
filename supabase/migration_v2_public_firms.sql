-- ============================================================================
-- MIGRATION V2: Public Firms + Admin System
-- ============================================================================
-- This migration transforms the architecture:
--   - Firms become PUBLIC (readable by everyone, writable only by admins)
--   - Accounts remain per-user (behind authentication)
--   - New admin_users table for role management
-- ============================================================================

-- ============================================================================
-- 1. CREATE admin_users TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RLS on admin_users: everyone can read (to check admin status), only admins can modify
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check admin status"
  ON public.admin_users
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert admin users"
  ON public.admin_users
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM public.admin_users)
  );

CREATE POLICY "Only admins can delete admin users"
  ON public.admin_users
  FOR DELETE
  USING (
    auth.uid() IN (SELECT user_id FROM public.admin_users)
  );

-- ============================================================================
-- 2. HELPER FUNCTION: is_admin()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. UPDATE FIRMS TABLE: Make user_id NULLABLE (firms are now global)
-- ============================================================================
ALTER TABLE public.firms ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================================
-- 4. DROP OLD FIRMS RLS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own firms" ON public.firms;
DROP POLICY IF EXISTS "Users can insert their own firms" ON public.firms;
DROP POLICY IF EXISTS "Users can update their own firms" ON public.firms;
DROP POLICY IF EXISTS "Users can delete their own firms" ON public.firms;

-- ============================================================================
-- 5. CREATE NEW FIRMS RLS POLICIES (public read, admin write)
-- ============================================================================
-- Anyone (even unauthenticated via anon key) can read firms
CREATE POLICY "Anyone can view firms"
  ON public.firms
  FOR SELECT
  USING (true);

-- Only admins can insert firms
CREATE POLICY "Admins can insert firms"
  ON public.firms
  FOR INSERT
  WITH CHECK (public.is_admin());

-- Only admins can update firms
CREATE POLICY "Admins can update firms"
  ON public.firms
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Only admins can delete firms
CREATE POLICY "Admins can delete firms"
  ON public.firms
  FOR DELETE
  USING (public.is_admin());

-- ============================================================================
-- 6. RPC: lookup_user_by_email (for admin panel to add admins by email)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lookup_user_by_email(target_email TEXT)
RETURNS UUID AS $$
DECLARE
  found_id UUID;
BEGIN
  -- Only admins can use this function
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO found_id FROM auth.users WHERE email = target_email LIMIT 1;

  IF found_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN found_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. SEED INITIAL ADMIN USER
-- ============================================================================
-- Insert alex@digitegrity.ro as admin (lookup by email in auth.users)
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'alex@digitegrity.ro'
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- 8. SET user_id TO NULL ON EXISTING FIRMS (they are now global)
-- ============================================================================
UPDATE public.firms SET user_id = NULL;
