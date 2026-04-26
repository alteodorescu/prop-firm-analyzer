-- ============================================================================
-- MIGRATION v5 — UTM tracking + funnel views for the waitlist
-- ============================================================================
-- Adds UTM columns to public.waitlist and creates two views:
--   • public.waitlist_funnel — signups grouped by source/medium/campaign
--   • public.waitlist_daily  — signups by day, attributed vs direct
--
-- Both views inherit the table's RLS, so only admins (per migration v4)
-- can SELECT from them. The Landing page submits via anon role and is
-- allowed to write any of the new columns.
--
-- Apply: psql <DATABASE_URL> -f supabase/migration_v5_waitlist_utm.sql
-- ============================================================================

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS referrer     TEXT,
  ADD COLUMN IF NOT EXISTS landing_path TEXT;

CREATE INDEX IF NOT EXISTS waitlist_utm_source_idx
  ON public.waitlist (utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx
  ON public.waitlist (created_at DESC);

-- ── Funnel view: signups grouped by attribution dimensions ───────────────────
CREATE OR REPLACE VIEW public.waitlist_funnel AS
SELECT
  COALESCE(utm_source,  'direct') AS source,
  COALESCE(utm_medium,  '-')      AS medium,
  COALESCE(utm_campaign, '-')     AS campaign,
  COUNT(*)::INT                   AS signups,
  MIN(created_at)                 AS first_signup,
  MAX(created_at)                 AS latest_signup
FROM public.waitlist
GROUP BY 1, 2, 3
ORDER BY signups DESC;

-- ── Daily summary: signup trend, attributed vs direct ────────────────────────
CREATE OR REPLACE VIEW public.waitlist_daily AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date  AS day,
  COUNT(*)::INT                                            AS signups,
  COUNT(*) FILTER (WHERE utm_source IS NOT NULL)::INT      AS attributed,
  COUNT(*) FILTER (WHERE utm_source IS NULL)::INT          AS direct
FROM public.waitlist
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.waitlist_funnel IS
  'Waitlist signups grouped by UTM source/medium/campaign. Read by Marketing dashboards.';
COMMENT ON VIEW public.waitlist_daily IS
  'Daily waitlist signup count. Useful for trend / weekly review.';
