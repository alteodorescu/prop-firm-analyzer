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
  // Use the clean base URL (token goes in JSON body, not URL)
  const webhookUrl = config.pickmytradeWebhookUrl || "https://api.pickmytrade.io/v2/add-trade-data-latest";

  if (!webhookUrl) {
    log.warn(TAG, `No PickMyTrade webhook URL for account "${account.label}"`);
    return { success: false, error: "No webhook URL configured" };
  }

  // Build PickMyTrade Indicator JSON payload
  // Matches the exact format from PMT's Generate Alert page.
  //
  // URL: https://api.pickmytrade.trade/v2/add-trade-data-latest?t=<userId>
  // Body: token = alert token (required), multiple_accounts = which Tradovate account to trade
  // sl/tp: exact price levels
  const token = account.pmtToken || config.pickmytradeToken;
  const accountId = account.tradovateAccountId || config.tradovateAccountId;
  const payload = {
    strategy_name: "server",
    symbol: config.symbol,
    date: new Date().toISOString(),
    data: plan.direction,        // "buy" or "sell"
    quantity: plan.contracts,
    risk_percentage: 0,
    price: plan.entry,           // entry price
    order_type: "MKT",
    gtd_in_second: 0,
    stp_limit_stp_price: 0,
    tp: plan.target,             // exact TP price level
    percentage_tp: 0,
    dollar_tp: 0,
    sl: plan.stop,               // exact SL price level
    percentage_sl: 0,
    dollar_sl: 0,
    trail: 0,
    trail_stop: 0,
    trail_trigger: 0,
    trail_freq: 0,
    update_tp: false,
    update_sl: false,
    breakeven: 0,
    breakeven_offset: 0,
    token,                       // alert token in body (required)
    pyramid: false,
    same_direction_ignore: false,
    reverse_order_close: true,
    multiple_accounts: [
      {
        token,
        account_id: accountId,   // Tradovate account ID (routes trade to correct account)
        risk_percentage: 0,
        quantity_multiplier: 1,
      },
    ],
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
