// ═══════════════════════════════════════════════════════════
// PROP FIRM AUTOMATION SERVER
// ═══════════════════════════════════════════════════════════
// Architecture:
//   Data Feed → ORB Engine → Risk Engine → Execution
//
// Execution methods:
//   1. Playwright — direct Tradovate browser automation (primary)
//   2. PickMyTrade — legacy webhook fallback
//
// Data feed sources:
//   - playwright: reads price from Tradovate via browser
//   - tradingview: receives price via HTTP webhook
//   - mock: simulated price action for testing
//   - dxfeed / databento: real-time market data feeds
// ═══════════════════════════════════════════════════════════

import express from "express";
import { config } from "./config.js";
import { log } from "./lib/logger.js";
import { createFeed } from "./lib/data-feed.js";
import { OrbEngine } from "./lib/orb-engine.js";
import { evaluateAllAccounts, recordSessionResult } from "./lib/risk-engine.js";
import { executeAll, setSessionManager } from "./lib/execution.js";
import { logTrade } from "./lib/supabase.js";
import { refreshAccounts, getCachedAccounts, getCacheStatus } from "./lib/account-cache.js";
import { tradeTracker } from "./lib/trade-tracker.js";
import { TradovateSessionManager } from "./lib/tradovate-browser.js";
import webhookRoutes from "./routes/webhook.js";

const TAG = "MAIN";

// ─────────────────────────────────────────────────────────
// Express server for webhooks and status API
// ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Webhook routes
app.use("/api/webhook", webhookRoutes);

// Status endpoint
let engineStatus = { feed: "disconnected", orb: {}, lastSignal: null, lastExecution: null, playwright: {} };
let activeFeed = null; // Expose feed for TradingView webhook route
let browserManager = null; // TradovateSessionManager for Playwright

app.get("/api/status", (req, res) => {
  res.json({
    uptime: process.uptime(),
    feed: engineStatus.feed,
    orb: engineStatus.orb,
    lastSignal: engineStatus.lastSignal,
    lastExecution: engineStatus.lastExecution,
    accountCache: getCacheStatus(),
    openTrades: tradeTracker.getOpenTrades(),
    playwright: browserManager ? browserManager.getStatus() : {},
    config: {
      symbol: config.symbol,
      feedType: config.feedType,
      executionMethod: config.executionMethod,
      londonOr: `${config.londonOrStart}-${config.londonOrEnd}`,
      nyOr: `${config.nyOrStart}-${config.nyOrEnd}`,
      playwrightEnabled: config.playwrightEnabled,
      pickmytradeEnabled: config.pickmytradeEnabled,
    },
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// TradingView webhook tick endpoint
// Accepts 5-min OHLC from TradingView alert:
//   {"open":{{open}},"high":{{high}},"low":{{low}},"close":{{close}}}
// Also accepts legacy format for backward compat:
//   {"price": 18400.50} or plain number
app.post("/api/tv-tick", (req, res) => {
  if (!activeFeed || typeof activeFeed.injectTick !== "function") {
    return res.status(400).json({ error: "Feed is not in TradingView/Playwright mode. Set FEED_TYPE=tradingview or FEED_TYPE=playwright" });
  }

  let candle = {};

  if (req.body && typeof req.body === "object") {
    // Full OHLC format (preferred): {"open":X,"high":X,"low":X,"close":X}
    if (req.body.close != null) {
      candle.close = parseFloat(req.body.close);
      candle.open  = req.body.open  != null ? parseFloat(req.body.open)  : candle.close;
      candle.high  = req.body.high  != null ? parseFloat(req.body.high)  : candle.close;
      candle.low   = req.body.low   != null ? parseFloat(req.body.low)   : candle.close;
    }
    // Legacy format: {"price": X}
    else if (req.body.price != null) {
      const p = parseFloat(req.body.price);
      candle = { open: p, high: p, low: p, close: p };
    }
  } else if (typeof req.body === "string" || typeof req.body === "number") {
    const p = parseFloat(req.body);
    candle = { open: p, high: p, low: p, close: p };
  }

  if (isNaN(candle.close) || candle.close <= 0) {
    return res.status(400).json({ error: 'Invalid candle. Send {"open":X,"high":X,"low":X,"close":X}' });
  }

  log.info("TV", `Raw payload: ${JSON.stringify(req.body)} → parsed candle O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close}`);
  activeFeed.injectTick(candle);
  res.json({ ok: true });
});

// Also accept plain text from TradingView alerts
app.use("/api/tv-tick-text", express.text());
app.post("/api/tv-tick-text", (req, res) => {
  if (!activeFeed || typeof activeFeed.injectTick !== "function") {
    return res.status(400).json({ error: "Feed is not in TradingView/Playwright mode" });
  }
  const price = parseFloat(req.body);
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: "Invalid price" });
  }
  activeFeed.injectTick(price);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────
// Playwright session management API
// ─────────────────────────────────────────────────────────

// Get browser session status
app.get("/api/playwright/status", (req, res) => {
  res.json({
    active: !!browserManager,
    sessions: browserManager ? browserManager.getStatus() : {},
  });
});

// ─────────────────────────────────────────────────────────
// Core pipeline: Feed → ORB → Risk → Execute
// ─────────────────────────────────────────────────────────
async function startPipeline() {
  log.info(TAG, "═══════════════════════════════════════════════");
  log.info(TAG, "  Prop Firm ORB Automation Server v3.0");
  log.info(TAG, "═══════════════════════════════════════════════");
  log.info(TAG, `Symbol: ${config.symbol}`);
  log.info(TAG, `Feed: ${config.feedType}`);
  log.info(TAG, `Execution: ${config.executionMethod}`);
  log.info(TAG, `Playwright: ${config.playwrightEnabled ? "LIVE" : "DRY RUN"} (headless=${config.playwrightHeadless})`);
  log.info(TAG, `PickMyTrade: ${config.pickmytradeEnabled ? "LIVE" : "DRY RUN"}`);
  log.info(TAG, "");

  // ── Initialize Playwright session manager ──
  browserManager = new TradovateSessionManager({
    headless: config.playwrightHeadless,
    encryptionKey: config.credentialEncryptionKey,
  });

  // Wire session manager into execution module
  setSessionManager(browserManager);

  // Forward login errors to status
  browserManager.on("login_error", ({ session, error }) => {
    log.error(TAG, `Playwright login failed for "${session}": ${error}`);
  });

  // 1. Create data feed
  const feed = createFeed();
  activeFeed = feed; // Expose for TradingView webhook route

  // 2. Create ORB engine
  const orb = new OrbEngine();

  // ── If using Playwright feed, wire browser ticks → feed ──
  if (config.feedType === "playwright") {
    browserManager.on("tick", (tick) => {
      if (typeof activeFeed.injectTick === "function") {
        activeFeed.injectTick(tick);
      }
    });
    log.info(TAG, "Playwright feed: browser ticks will be forwarded to ORB engine");
  }

  // 3. Wire: feed ticks → ORB engine + Trade tracker
  let tickCount = 0;
  feed.on("tick", (tick) => {
    tickCount++;

    // ORB engine: detects OR formation and breakout signals
    orb.processTick(tick);

    // Trade tracker: checks if any open trade hit TP or SL this candle
    tradeTracker.checkCandle(tick);

    // Update status (throttled)
    if (tickCount % 10 === 0) {
      engineStatus.feed = "connected";
      engineStatus.orb = orb.getStatus();
    }
  });

  // ── Account cache refresh triggers ──────────────────────
  // 1. OR formation starts (first candle of session window)
  orb.on("or_forming", ({ session }) => {
    log.info(TAG, `${session} OR forming — refreshing account metrics`);
    refreshAccounts(`${session} OR forming`);
  });

  // 2. OR locked (all 3 candles done — metrics will be ready by signal time)
  orb.on("or_set", ({ session, orHigh, orLow }) => {
    log.info(TAG, `OR set for ${session} (High=${orHigh} Low=${orLow}) — refreshing account metrics`);
    refreshAccounts(`${session} OR locked`);
  });

  // 3. Hourly refresh — catches manual journal updates throughout the day
  setInterval(() => refreshAccounts("hourly"), 60 * 60 * 1000);
  log.info(TAG, "Account cache: refreshing every hour + at OR formation + at OR lock + after trade close");

  // Initial load on startup
  refreshAccounts("startup");

  // ── Trade tracker: automatic journal write on TP/SL hit ─
  // When a candle crosses the TP or SL of an open trade,
  // trade-tracker.js emits "trade_closed" with exact P&L.
  // We write that to Supabase so the account tracker is always
  // up to date — zero manual intervention needed.
  tradeTracker.on("trade_closed", async ({ trade, result }) => {
    const { accountId, label, direction, session, contracts } = trade;
    const { outcome, exitPrice, pnl, newBalance } = result;

    log.trade(TAG, `Auto-journaling "${label}": ${outcome.toUpperCase()} P&L=$${pnl >= 0 ? "+" : ""}${pnl}`);

    try {
      // Write journal entry to Supabase
      const journalEntry = {
        date:      new Date().toISOString().slice(0, 10),
        balance:   newBalance,
        pnl,
        trades:    1,
        notes:     `ORB Auto: ${direction.toUpperCase()} ${session} → ${outcome.toUpperCase()} @ ${exitPrice}`,
        flags:     "auto",
      };
      await logTrade(accountId, journalEntry);

      // Record actual (not estimated) London result so NY session adjusts correctly
      if (session.toLowerCase() === "london") {
        recordSessionResult(accountId, pnl, contracts);
        log.info(TAG, `Recorded ACTUAL London result for "${label}": $${pnl}`);
      }

      // Refresh cache so the next session uses the updated balance
      refreshAccounts(`trade closed (${label} ${outcome.toUpperCase()})`);

    } catch (err) {
      log.error(TAG, `Failed to auto-journal trade for "${label}":`, err.message);
    }
  });

  // 4b. Wire: ORB signals → Risk evaluation → Execution
  orb.on("signal", async (signal) => {
    log.signal(TAG, "════════════════════════════════════════");
    log.signal(TAG, `ORB SIGNAL: ${signal.direction.toUpperCase()} @ ${signal.entry} (${signal.session})`);
    log.signal(TAG, "════════════════════════════════════════");

    engineStatus.lastSignal = { ...signal, timestamp: new Date().toISOString() };

    try {
      // Use shared cache — already refreshed at OR forming + OR lock.
      // Fall back to live fetch if cache is empty for any reason.
      let accounts = getCachedAccounts();
      if (!accounts) {
        log.warn(TAG, "Account cache empty — fetching fresh now...");
        accounts = await refreshAccounts("signal fallback");
      }

      if (accounts.length === 0) {
        log.warn(TAG, "No automated accounts found. Signal ignored.");
        return;
      }

      log.info(TAG, `Evaluating ${accounts.length} automated accounts...`);

      // Evaluate each account against this signal
      const evaluations = evaluateAllAccounts(accounts, signal);

      const approved = evaluations.filter((e) => e.evaluation.approved);
      const rejected = evaluations.filter((e) => !e.evaluation.approved);

      log.info(TAG, `Results: ${approved.length} approved, ${rejected.length} rejected`);

      if (approved.length === 0) {
        log.warn(TAG, "No accounts approved for this signal.");
        return;
      }

      // Execute trades for approved accounts
      const results = await executeAll(approved);
      engineStatus.lastExecution = {
        timestamp: new Date().toISOString(),
        signal: signal.direction,
        session: signal.session,
        approved: approved.length,
        rejected: rejected.length,
        results,
      };

      log.trade(TAG, `Execution complete: ${results.length} orders sent`);

      // Register each successfully sent trade with the tracker.
      // The tracker watches every incoming candle and fires "trade_closed"
      // when price crosses TP or SL — triggering automatic journal write.
      for (const result of results) {
        if (!result.execution.success && !result.execution.dryRun) continue;

        // Find the matching account evaluation to get prevBalance
        const matchedEval = approved.find((e) => e.account.id === result.accountId);
        if (!matchedEval) continue;

        tradeTracker.openTrade({
          accountId:   result.accountId,
          label:       result.accountLabel,
          direction:   result.direction,
          entry:       result.entry,
          stop:        result.stop,
          target:      result.target,
          contracts:   result.contracts,
          prevBalance: result.balance,    // balance at signal time from risk engine
          session:     result.session,
        });
      }

      // London session: record EXPECTED P&L so NY can do its own planning.
      // This is a temporary estimate — trade_closed event will overwrite it
      // with the actual P&L once TP or SL is confirmed.
      if (signal.session.toLowerCase() === "london") {
        for (const { account, evaluation } of approved) {
          const expectedPnl = evaluation.plan.rewardDollars || 0;
          recordSessionResult(account.id, expectedPnl, evaluation.plan.contracts);
          log.info(TAG, `London trade open for "${account.label}" — estimated P&L: $${expectedPnl} (will update on close)`);
        }
      }
    } catch (err) {
      log.error(TAG, "Error processing signal:", err.message);
    }
  });

  // ── If Playwright feed, start price polling after first session connects ──
  if (config.feedType === "playwright") {
    // Price feed starts when the first account cache refresh triggers
    // a session login. We hook into the account cache refresh.
    const startPriceFeedOnce = () => {
      if (browserManager.sessions.size > 0) {
        browserManager.startPriceFeed(config.symbol, 1000);
        log.info(TAG, "Playwright price feed started from first active session");
      }
    };

    // Check every 5 seconds until a session is available
    const priceFeedWatcher = setInterval(() => {
      if (browserManager.sessions.size > 0) {
        startPriceFeedOnce();
        clearInterval(priceFeedWatcher);
      }
    }, 5000);
  }

  // 5. Connect feed
  await feed.connect();
  engineStatus.feed = "connected";
}

// ─────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────
async function shutdown() {
  log.info(TAG, "Shutting down...");
  if (browserManager) {
    await browserManager.closeAll();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─────────────────────────────────────────────────────────
// Start everything
// ─────────────────────────────────────────────────────────
app.listen(config.port, () => {
  log.info(TAG, `HTTP server listening on http://localhost:${config.port}`);
  log.info(TAG, `Status: http://localhost:${config.port}/api/status`);
  log.info(TAG, "");
});

startPipeline().catch((err) => {
  log.error(TAG, "Fatal error starting pipeline:", err);
  process.exit(1);
});
