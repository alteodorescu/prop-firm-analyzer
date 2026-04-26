-- ============================================================================
-- MIGRATION v6 — Public-readable waitlist count
-- ============================================================================
-- The landing page wants to show "N traders on the list" as social proof,
-- but the waitlist table itself is admin-read-only (the rows contain emails
-- and we don't want anon clients enumerating them).
--
-- Solution: a SECURITY DEFINER function that returns just the COUNT(*) and
-- exposes nothing else. anon and authenticated roles can call it; nobody
-- can use it to derive any individual signup detail.
--
-- Apply: psql <DATABASE_URL> -f supabase/migration_v6_waitlist_count.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.waitlist_count()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.waitlist;
$$;

REVOKE ALL ON FUNCTION public.waitlist_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.waitlist_count() TO anon, authenticated;

COMMENT ON FUNCTION public.waitlist_count() IS
  'Returns the total number of waitlist signups. Safe for anon read — discloses no row data.';
