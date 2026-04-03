// ═══════════════════════════════════════════════════════════
// SUPABASE CLIENT — Server-side data access
// ═══════════════════════════════════════════════════════════
// Uses the service role key for full access (no RLS).
// Reads automated accounts + firm data, writes trade logs.
// ═══════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "DB";

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/**
 * Map DB rows to camelCase (same as frontend useSupabaseData)
 */
function mapDbToFirm(row) {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    cost: row.cost,
    resetCost: row.reset_cost === "na" ? "na" : row.reset_cost != null ? Number(row.reset_cost) : null,
    maxNQ: row.max_nq,
    instant: row.instant,
    pt: row.pt,
    mll: row.mll,
    mllType: row.mll_type,
    dll: row.dll,
    consistency: row.consistency,
    minDays: row.min_days,
    minProfit: row.min_profit,
    fMll: row.f_mll,
    fMllType: row.f_mll_type,
    fDll: row.f_dll,
    fConsistency: row.f_consistency,
    fMinDays: row.f_min_days,
    fMinProfit: row.f_min_profit,
    activation: row.activation,
    buffer: row.buffer,
    split: row.split,
    withdrawalPct: row.withdrawal_pct,
    scalingChal: row.scaling_chal || [],
    scalingFund: row.scaling_fund || [],
    payoutTiers: row.payout_tiers || [],
    specialRules: row.special_rules,
  };
}

function mapDbToAccount(row) {
  return {
    id: row.id,
    userId: row.user_id,
    firmId: row.firm_id,
    label: row.label,
    phase: row.phase,
    startBalance: row.start_balance,
    startDate: row.start_date,
    status: row.status,
    journal: row.journal || [],
    payouts: row.payouts || [],
    resets: row.resets || [],
    // Automation fields
    autoEnabled: row.auto_enabled || false,
    autoSessions: row.auto_sessions || "both", // "london", "ny", "both"
    pmtWebhookUrl: row.pmt_webhook_url || null,
    tradovateAccountId: row.tradovate_account_id || null, // Tradovate account ID for PMT routing
  };
}

/**
 * Get all accounts that have automation enabled, with their firm data
 * @returns {Array} [{ account, firm }]
 */
export async function getAutomatedAccounts() {
  try {
    // Get accounts with automation enabled
    const { data: accountRows, error: accErr } = await supabase
      .from("accounts")
      .select("*")
      .eq("auto_enabled", true)
      .eq("status", "active");

    if (accErr) throw accErr;
    if (!accountRows || accountRows.length === 0) return [];

    // Get all firms (they're global)
    const { data: firmRows, error: firmErr } = await supabase
      .from("firms")
      .select("*");

    if (firmErr) throw firmErr;

    const firmMap = new Map();
    for (const row of firmRows || []) {
      firmMap.set(row.id, mapDbToFirm(row));
    }

    // Pair accounts with their firms
    const result = [];
    for (const row of accountRows) {
      const account = mapDbToAccount(row);
      const firm = firmMap.get(account.firmId);
      if (!firm) {
        log.warn(TAG, `Account "${account.label}" has no matching firm (firmId=${account.firmId})`);
        continue;
      }
      result.push({ account, firm });
    }

    log.info(TAG, `Loaded ${result.length} automated accounts`);
    return result;
  } catch (err) {
    log.error(TAG, "Failed to load automated accounts:", err.message);
    return [];
  }
}

/**
 * Log a trade execution to the account's journal in Supabase
 */
export async function logTrade(accountId, tradeEntry) {
  try {
    // Get current journal
    const { data: row, error: fetchErr } = await supabase
      .from("accounts")
      .select("journal")
      .eq("id", accountId)
      .single();

    if (fetchErr) throw fetchErr;

    const journal = row.journal || [];
    journal.push(tradeEntry);

    // Update journal
    const { error: updateErr } = await supabase
      .from("accounts")
      .update({ journal })
      .eq("id", accountId);

    if (updateErr) throw updateErr;

    log.info(TAG, `Trade logged for account ${accountId}: ${tradeEntry.pnl >= 0 ? "+" : ""}$${tradeEntry.pnl}`);
  } catch (err) {
    log.error(TAG, `Failed to log trade for account ${accountId}:`, err.message);
  }
}

/**
 * Get all firms (for the API)
 */
export async function getAllFirms() {
  const { data, error } = await supabase.from("firms").select("*").order("id");
  if (error) throw error;
  return (data || []).map(mapDbToFirm);
}

/**
 * Get all accounts for a user (for the API)
 */
export async function getAccountsByUser(userId) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("id");
  if (error) throw error;
  return (data || []).map(mapDbToAccount);
}

export { supabase };
