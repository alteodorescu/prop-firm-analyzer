// ═══════════════════════════════════════════════════════════
// EXECUTION ROUTER — Trades via Playwright or PickMyTrade
// ═══════════════════════════════════════════════════════════
// Primary: Playwright places orders directly on Tradovate
// Fallback: PickMyTrade webhook (legacy, kept for migration)
// ═══════════════════════════════════════════════════════════

import { config } from "../config.js";
import { log } from "./logger.js";
import { decryptCredential } from "./tradovate-browser.js";

const TAG = "EXEC";

// Reference to the shared TradovateSessionManager — set by index.js
let sessionManager = null;

/**
 * Set the TradovateSessionManager instance for Playwright execution.
 * Called once during server startup in index.js.
 */
export function setSessionManager(manager) {
  sessionManager = manager;
}

// ─────────────────────────────────────────────────────────
// Playwright execution — direct browser-based trading
// ─────────────────────────────────────────────────────────

/**
 * Execute a trade via Playwright (direct Tradovate browser control).
 *
 * @param {object} account - Account data (includes tradovateUsername, tradovatePassword, tradovateAccountId)
 * @param {object} plan - Approved plan from risk engine (direction, contracts, entry, stop, target)
 * @returns {{ success: boolean, dryRun?: boolean, error?: string }}
 */
async function executeViaPlaywright(account, plan) {
  if (!sessionManager) {
    log.error(TAG, "SessionManager not initialized — cannot execute via Playwright");
    return { success: false, error: "Playwright session manager not initialized" };
  }

  const username = account.tradovateUsername;
  const encryptedPassword = account.tradovatePassword;
  const accountId = account.tradovateAccountId;

  if (!username || !encryptedPassword) {
    log.warn(TAG, `No Tradovate credentials for account "${account.label}"`);
    return { success: false, error: "Missing Tradovate credentials" };
  }

  if (!accountId) {
    log.warn(TAG, `No Tradovate account ID for account "${account.label}"`);
    return { success: false, error: "Missing Tradovate account ID" };
  }

  // Decrypt password
  let password;
  try {
    password = decryptCredential(encryptedPassword, config.credentialEncryptionKey);
  } catch (err) {
    log.error(TAG, `Failed to decrypt password for "${account.label}":`, err.message);
    return { success: false, error: "Failed to decrypt Tradovate password" };
  }

  if (!config.playwrightEnabled) {
    log.warn(TAG, "Playwright DISABLED (dry run). Set PLAYWRIGHT_ENABLED=true to send real orders.");
    return {
      success: true,
      dryRun: true,
      order: {
        accountId,
        symbol: config.symbol,
        direction: plan.direction,
        contracts: plan.contracts,
        stop: plan.stop,
        target: plan.target,
      },
    };
  }

  // Place the order
  const result = await sessionManager.placeOrder(
    {
      accountId,
      symbol: config.symbol,
      direction: plan.direction,
      contracts: plan.contracts,
      stop: plan.stop,
      target: plan.target,
    },
    username,
    password,
    account.label
  );

  if (result.success) {
    log.trade(TAG, `Playwright order placed for "${account.label}": ${plan.direction.toUpperCase()} ${plan.contracts}x`);
  } else {
    log.error(TAG, `Playwright order failed for "${account.label}": ${result.error}`);
  }

  return result;
}

// ─────────────────────────────────────────────────────────
// PickMyTrade execution — legacy webhook (kept as fallback)
// ─────────────────────────────────────────────────────────

/**
 * Send a trade signal to PickMyTrade (legacy fallback).
 */
async function executeViaPMT(account, plan) {
  const webhookUrl = config.pickmytradeWebhookUrl || "https://api.pickmytrade.io/v2/add-trade-data-latest";

  if (!webhookUrl) {
    log.warn(TAG, `No PickMyTrade webhook URL for account "${account.label}"`);
    return { success: false, error: "No webhook URL configured" };
  }

  const token = account.pmtToken || config.pickmytradeToken;
  const accountId = account.tradovateAccountId || config.tradovateAccountId;
  const payload = {
    strategy_name: "server",
    symbol: config.symbol,
    date: new Date().toISOString(),
    data: plan.direction,
    quantity: plan.contracts,
    risk_percentage: 0,
    price: plan.entry,
    order_type: "MKT",
    gtd_in_second: 0,
    stp_limit_stp_price: 0,
    tp: plan.target,
    percentage_tp: 0,
    dollar_tp: 0,
    sl: plan.stop,
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
    token,
    pyramid: false,
    same_direction_ignore: false,
    reverse_order_close: true,
    multiple_accounts: [
      {
        token,
        account_id: accountId,
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

// ─────────────────────────────────────────────────────────
// Unified execution router
// ─────────────────────────────────────────────────────────

/**
 * Execute a single trade — routes to Playwright or PMT based on config.
 */
async function executeTrade(account, plan) {
  // Playwright is the primary execution method
  if (config.executionMethod === "playwright") {
    return executeViaPlaywright(account, plan);
  }

  // PickMyTrade as legacy fallback
  if (config.executionMethod === "pickmytrade") {
    return executeViaPMT(account, plan);
  }

  // Default: try Playwright if credentials exist, else PMT
  if (account.tradovateUsername && account.tradovatePassword) {
    return executeViaPlaywright(account, plan);
  }

  if (account.pmtWebhookUrl || config.pickmytradeWebhookUrl) {
    return executeViaPMT(account, plan);
  }

  log.warn(TAG, `No execution method configured for "${account.label}"`);
  return { success: false, error: "No execution method configured (no Tradovate credentials or PMT webhook)" };
}

/**
 * Execute approved trades for all evaluated accounts.
 *
 * @param {Array} evaluations - From risk engine: [{ account, evaluation }]
 * @returns {Array} Results with execution status
 */
export async function executeAll(evaluations) {
  const results = [];

  for (const { account, evaluation } of evaluations) {
    if (!evaluation.approved) continue;

    const execResult = await executeTrade(account, evaluation.plan);
    results.push({
      accountId: account.id,
      accountLabel: account.label,
      ...evaluation.plan,
      execution: execResult,
    });
  }

  return results;
}
