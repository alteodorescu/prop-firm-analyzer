-- ============================================================================
-- MIGRATION v4 — Public waitlist for landing-page signups
-- ============================================================================
-- Captures pre-launch emails from /landing. Anonymous users can INSERT; only
-- authenticated admins can SELECT (via admin_users table). Email is stored
-- case-preserved but de-duplicated case-insensitively.
--
-- Apply: psql <DATABASE_URL> -f supabase/migration_v4_waitlist.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waitlist (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  source       TEXT,                   -- e.g. "landing", "twitter-utm", etc.
  role         TEXT,                   -- optional self-identified role: "manual", "copier", "both"
  pain_text    TEXT,                   -- optional free-text: "what's your biggest pain"
  user_agent   TEXT,                   -- rough attribution
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive uniqueness on email so double-submits don't pollute.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_idx
  ON public.waitlist (LOWER(email));

-- Basic email sanity check (not RFC-perfect — just keeps obvious junk out).
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_email_format
  CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- RLS: anon can INSERT, only admins can SELECT
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_can_join_waitlist" ON public.waitlist;
CREATE POLICY "anon_can_join_waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Admins (rows in admin_users) can read and manage the list
DROP POLICY IF EXISTS "admins_can_read_waitlist" ON public.waitlist;
CREATE POLICY "admins_can_read_waitlist"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins_can_delete_waitlist" ON public.waitlist;
CREATE POLICY "admins_can_delete_waitlist"
  ON public.waitlist
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.waitlist IS
  'Pre-launch email capture from the marketing landing page. Anon inserts; admins read/delete.';
