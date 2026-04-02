// ═══════════════════════════════════════════════════════════
// PROP FIRM AUTOMATION SERVER
// ═══════════════════════════════════════════════════════════
// Path B Architecture:
//   Data Feed → ORB Engine → Risk Engine → PickMyTrade
//
// Our app is the brain: detects ORB breakouts, evaluates
// each account's rules, and sends per-account trade signals
// to PickMyTrade for execution on Tradovate.
// ═══════════════════════════════════════════════════════════

import express from "express";
import { config } from "./config.js";
import { log } from "./lib/logger.js";
import { createFeed } from "./lib/data-feed.js";
import { OrbEngine } from "./lib/orb-engine.js";
import { evaluateAllAccounts } from "./lib/risk-engine.js";
import { executeAll } from "./lib/execution.js";
import { getAutomatedAccounts, logTrade } from "./lib/supabase.js";
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
let engineStatus = { feed: "disconnected", orb: {}, lastSignal: null, lastExecution: null };
let activeFeed = null; // Expose feed for TradingView webhook route

app.get("/api/status", (req, res) => {
  res.json({
    uptime: process.uptime(),
    feed: engineStatus.feed,
    orb: engineStatus.orb,
    lastSignal: engineStatus.lastSignal,
    lastExecution: engineStatus.lastExecution,
    config: {
      symbol: config.symbol,
      feedType: config.feedType,
      londonOr: `${config.londonOrStart}-${config.londonOrEnd}`,
      nyOr: `${config.nyOrStart}-${config.nyOrEnd}`,
      pickmytradeEnabled: config.pickmytradeEnabled,
    },
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// TradingView webhook tick endpoint
// Accepts: POST /api/tv-tick with body { "price": 18400.50 }
// Also supports TradingView alert message format: just a number "18400.50"
app.post("/api/tv-tick", (req, res) => {
  if (!activeFeed || typeof activeFeed.injectTick !== "function") {
    return res.status(400).json({ error: "Feed is not in TradingView mode. Set FEED_TYPE=tradingview" });
  }
  let price;
  if (req.body && req.body.price != null) {
    price = parseFloat(req.body.price);
  } else if (typeof req.body === "string" || typeof req.body === "number") {
    price = parseFloat(req.body);
  }
  // Also handle TradingView's plain text body
  if (isNaN(price) && req.headers["content-type"]?.includes("text")) {
    price = parseFloat(req.body);
  }
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: "Invalid price. Send { \"price\": 18400.50 }" });
  }
  activeFeed.injectTick(price);
  res.json({ ok: true });
});

// Also accept plain text from TradingView alerts
app.use("/api/tv-tick-text", express.text());
app.post("/api/tv-tick-text", (req, res) => {
  if (!activeFeed || typeof activeFeed.injectTick !== "function") {
    return res.status(400).json({ error: "Feed is not in TradingView mode" });
  }
  const price = parseFloat(req.body);
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: "Invalid price" });
  }
  activeFeed.injectTick(price);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────
// Core pipeline: Feed → ORB → Risk → Execute
// ─────────────────────────────────────────────────────────
async function startPipeline() {
  log.info(TAG, "═══════════════════════════════════════════════");
  log.info(TAG, "  Prop Firm ORB Automation Server v2.0");
  log.info(TAG, "═══════════════════════════════════════════════");
  log.info(TAG, `Symbol: ${config.symbol}`);
  log.info(TAG, `Feed: ${config.feedType}`);
  log.info(TAG, `PickMyTrade: ${config.pickmytradeEnabled ? "LIVE" : "DRY RUN"}`);
  log.info(TAG, "");

  // 1. Create data feed
  const feed = createFeed();
  activeFeed = feed; // Expose for TradingView webhook route

  // 2. Create ORB engine
  const orb = new OrbEngine();

  // 3. Wire: feed ticks → ORB engine
  let tickCount = 0;
  feed.on("tick", (tick) => {
    tickCount++;
    orb.processTick(tick);

    // Update status (throttled)
    if (tickCount % 10 === 0) {
      engineStatus.feed = "connected";
      engineStatus.orb = orb.getStatus();
    }
  });

  // 4. Wire: ORB signals → Risk evaluation → Execution
  orb.on("signal", async (signal) => {
    log.signal(TAG, "════════════════════════════════════════");
    log.signal(TAG, `ORB SIGNAL: ${signal.direction.toUpperCase()} @ ${signal.entry} (${signal.session})`);
    log.signal(TAG, "════════════════════════════════════════");

    engineStatus.lastSignal = { ...signal, timestamp: new Date().toISOString() };

    try {
      // Load all automated accounts from Supabase
      const accounts = await getAutomatedAccounts();

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

      // Log trades to Supabase for approved accounts (dry run mode)
      for (const result of results) {
        if (result.execution.dryRun) {
          // In dry run, simulate the trade result in the journal
          const journalEntry = {
            date: new Date().toISOString().slice(0, 10),
            balance: result.balance || 0, // Will be updated by actual fill
            pnl: 0, // Unknown until trade closes
            trades: 1,
            notes: `ORB ${result.direction} ${result.session} [PENDING]`,
            flags: "auto,pending",
          };
          // Don't log pending trades — wait for actual result via webhook
        }
      }
    } catch (err) {
      log.error(TAG, "Error processing signal:", err.message);
    }
  });

  // 5. Connect feed
  await feed.connect();
  engineStatus.feed = "connected";
}

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
