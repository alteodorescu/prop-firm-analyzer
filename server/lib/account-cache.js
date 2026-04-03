// ═══════════════════════════════════════════════════════════
// ACCOUNT CACHE — Shared, always-fresh account metrics
// ═══════════════════════════════════════════════════════════
// Refreshed at 3 points:
//   1. OR formation start (first candle of session)
//   2. OR locked (all 3 candles complete) — already fresh at signal time
//   3. Every hour — catches any manual journal updates during the day
//   4. After each trade closes — via PMT fill webhook
// ═══════════════════════════════════════════════════════════

import { getAutomatedAccounts } from "./supabase.js";
import { log } from "./logger.js";

const TAG = "CACHE";

let cachedAccounts = null;
let lastRefreshedAt = null;
let refreshInProgress = false;

/**
 * Refresh the account cache from Supabase.
 * Safe to call concurrently — deduplicates in-flight requests.
 *
 * @param {string} reason - Human-readable reason for logging
 * @returns {Array} Fresh accounts (or stale cache on error)
 */
export async function refreshAccounts(reason) {
  if (refreshInProgress) {
    log.info(TAG, `Refresh already in progress (${reason}) — skipping`);
    return cachedAccounts;
  }

  refreshInProgress = true;
  try {
    const accounts = await getAutomatedAccounts();
    cachedAccounts = accounts;
    lastRefreshedAt = new Date();
    log.info(TAG, `Accounts refreshed (${reason}): ${accounts.length} loaded`);
    return accounts;
  } catch (err) {
    log.warn(TAG, `Account refresh failed (${reason}): ${err.message} — using stale cache`);
    return cachedAccounts;
  } finally {
    refreshInProgress = false;
  }
}

/**
 * Get the current cached accounts.
 * Returns null if cache has never been populated.
 */
export function getCachedAccounts() {
  return cachedAccounts;
}

/**
 * Get cache metadata for status endpoint.
 */
export function getCacheStatus() {
  return {
    count: cachedAccounts ? cachedAccounts.length : 0,
    lastRefreshedAt: lastRefreshedAt ? lastRefreshedAt.toISOString() : null,
    stale: lastRefreshedAt ? (Date.now() - lastRefreshedAt.getTime()) > 3600000 : true,
  };
}
