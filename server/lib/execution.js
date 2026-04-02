// ═══════════════════════════════════════════════════════════
// EXECUTION ROUTER — PickMyTrade webhook integration
// ═══════════════════════════════════════════════════════════
// Sends per-account trade signals to PickMyTrade for
// execution on Tradovate. Each account has its own webhook.
// ═══════════════════════════════════════════════════════════

import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "EXEC";

/**
 * Send a trade signal to PickMyTrade
 *
 * @param {object} account - Account data
 * @param {object} plan - Approved plan from risk engine
 * @returns {object} { success, response, error }
 */
export async function executeViaPMT(account, plan) {
  // Each account stores its own PickMyTrade webhook URL
  const webhookUrl = account.pmtWebhookUrl || config.pickmytradeWebhookUrl;

  if (!webhookUrl) {
    log.warn(TAG, `No PickMyTrade webhook URL for account "${account.label}"`);
    return { success: false, error: "No webhook URL configured" };
  }

  // Build PickMyTrade JSON payload (v2/add-trade-data-latest format)
  // Use exact price levels for SL and TP (most reliable method).
  // Set dollar_/percentage_ variants to 0 so PMT uses the price levels.
  const payload = {
    symbol: config.symbol,
    date: new Date().toISOString(),
    data: plan.direction,        // "buy" or "sell"
    quantity: plan.contracts,
    risk_percentage: 0,
    price: plan.entry,
    gtd_in_second: 0,
    tp: plan.target,             // exact TP price level
    percentage_tp: 0,
    dollar_tp: 0,
    sl: plan.stop,               // exact SL price level
    percentage_sl: 0,
    dollar_sl: 0,
    trail: 0,                    // no trailing stop
    trail_stop: 0,
    trail_trigger: 0,
    trail_freq: 0,
    update_tp: false,
    update_sl: false,
    breakeven: 0,
  };

  log.trade(TAG, `Sending to PickMyTrade for "${account.label}":`, JSON.stringify(payload));

  if (!config.pickmytradeEnabled) {
    log.warn(TAG, "PickMyTrade DISABLED (dry run). Set PICKMYTRADE_ENABLED=true to send real orders.");
    return { success: true, dryRun: true, payload };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (response.ok) {
      log.trade(TAG, `PickMyTrade accepted: ${text}`);
      return { success: true, response: text };
    } else {
      log.error(TAG, `PickMyTrade rejected (${response.status}): ${text}`);
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
  } catch (err) {
    log.error(TAG, `PickMyTrade request failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Execute approved trades for all evaluated accounts
 *
 * @param {Array} evaluations - From risk engine: [{ account, evaluation }]
 * @returns {Array} Results with execution status
 */
export async function executeAll(evaluations) {
  const results = [];

  for (const { account, evaluation } of evaluations) {
    if (!evaluation.approved) continue;

    const execResult = await executeViaPMT(account, evaluation.plan);
    results.push({
      accountId: account.id,
      accountLabel: account.label,
      ...evaluation.plan,
      execution: execResult,
    });
  }

  return results;
}
