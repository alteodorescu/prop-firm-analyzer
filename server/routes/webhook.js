// ═══════════════════════════════════════════════════════════
// WEBHOOK ROUTES — Receive trade results and status queries
// ═══════════════════════════════════════════════════════════

import { Router } from "express";
import { logTrade } from "../lib/supabase.js";
import { log } from "../lib/logger.js";

const TAG = "WEBHOOK";
const router = Router();

/**
 * POST /api/webhook/trade-result
 *
 * Receives trade fill/close notifications from PickMyTrade
 * or manual updates. Updates the account journal in Supabase.
 *
 * Body: {
 *   accountId: number,
 *   date: "2026-04-06",
 *   balance: 51200,
 *   pnl: 1200,
 *   trades: 1,
 *   contracts: 2,
 *   direction: "long",
 *   session: "London",
 *   entry: 18451,
 *   exit: 18481,
 *   notes: "ORB Long Breakout",
 *   flags: ""
 * }
 */
router.post("/trade-result", async (req, res) => {
  try {
    const body = req.body;
    log.info(TAG, "Trade result received:", JSON.stringify(body));

    if (!body.accountId) {
      return res.status(400).json({ error: "accountId required" });
    }

    // Build journal entry matching the app's format
    const journalEntry = {
      date: body.date || new Date().toISOString().slice(0, 10),
      balance: body.balance,
      pnl: body.pnl || 0,
      trades: body.trades || 1,
      notes: body.notes || `ORB ${body.direction || ""} ${body.session || ""}`.trim(),
      flags: body.flags || "",
    };

    await logTrade(body.accountId, journalEntry);

    res.json({ success: true, logged: journalEntry });
  } catch (err) {
    log.error(TAG, "Error processing trade result:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/webhook/pmt-callback/:accountId
 *
 * Per-account callback endpoint for PickMyTrade fill notifications.
 * PickMyTrade can be configured to POST fill data here.
 */
router.post("/pmt-callback/:accountId", async (req, res) => {
  try {
    const accountId = parseInt(req.params.accountId, 10);
    const body = req.body;

    log.info(TAG, `PMT callback for account ${accountId}:`, JSON.stringify(body));

    // Map PickMyTrade fill data to our journal format
    // PMT format varies — adapt based on actual callback structure
    const pnl = parseFloat(body.pnl || body.profit || body.realizedPnl || 0);
    const journalEntry = {
      date: new Date().toISOString().slice(0, 10),
      balance: parseFloat(body.balance || 0),
      pnl,
      trades: 1,
      notes: `ORB Auto: ${body.side || body.data || ""} ${body.symbol || ""}`.trim(),
      flags: "auto",
    };

    if (journalEntry.balance > 0) {
      await logTrade(accountId, journalEntry);
    }

    res.json({ success: true });
  } catch (err) {
    log.error(TAG, "Error processing PMT callback:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
