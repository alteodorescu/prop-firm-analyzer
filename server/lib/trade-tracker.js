// ═══════════════════════════════════════════════════════════
// TRADE TRACKER — Automatic TP/SL detection + journal write
// ═══════════════════════════════════════════════════════════
// After PMT sends a trade to Tradovate (with exact TP and SL
// bracket orders), we watch every incoming 5-min candle.
// When the candle's high or low crosses the TP or SL level,
// we compute exact P&L and emit "trade_closed".
//
// The main pipeline (index.js) then:
//   1. Writes journal entry to Supabase  ← metrics updated
//   2. Refreshes account cache           ← next session correct
//   3. Records actual session result     ← NY session adjusts
//
// This makes the whole system zero-touch after setup.
// ═══════════════════════════════════════════════════════════

import EventEmitter from "events";
import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "TRACKER";

class TradeTracker extends EventEmitter {
  constructor() {
    super();
    // Key: Supabase account ID, Value: open trade object
    this.openTrades = new Map();
  }

  // ─────────────────────────────────────────────────────────
  // openTrade — Register a trade after PMT execution
  // ─────────────────────────────────────────────────────────
  /**
   * @param {object} trade
   *   accountId    {number}  Supabase account ID
   *   label        {string}  Account label (for logging)
   *   direction    {string}  "buy" | "sell"
   *   entry        {number}  Entry price
   *   stop         {number}  SL price
   *   target       {number}  TP price
   *   contracts    {number}  Number of contracts
   *   prevBalance  {number}  Account balance at trade open (from risk engine)
   *   session      {string}  "London" | "NY"
   */
  openTrade(trade) {
    const { accountId, label } = trade;

    if (this.openTrades.has(accountId)) {
      log.warn(TAG, `Account "${label}" already has an open trade — overwriting with new one`);
    }

    this.openTrades.set(accountId, {
      ...trade,
      entry:       parseFloat(trade.entry),
      stop:        parseFloat(trade.stop),
      target:      parseFloat(trade.target),
      contracts:   parseInt(trade.contracts, 10),
      prevBalance: parseFloat(trade.prevBalance),
      openedAt:    new Date().toISOString(),
    });

    log.trade(TAG, `Trade opened for "${label}": ${trade.direction.toUpperCase()} ${trade.contracts}x @ ${trade.entry}`);
    log.trade(TAG, `  TP=${trade.target}  SL=${trade.stop}  prev_balance=$${trade.prevBalance}`);
  }

  // ─────────────────────────────────────────────────────────
  // checkCandle — Called on every incoming 5-min OHLC candle
  // ─────────────────────────────────────────────────────────
  /**
   * Checks all open trades against the candle's high/low.
   * Emits "trade_closed" for each trade that hit TP or SL.
   *
   * @param {object} candle  { open, high, low, close }
   */
  checkCandle(candle) {
    if (this.openTrades.size === 0) return;

    const { high, low } = candle;

    for (const [accountId, trade] of this.openTrades) {
      const result = this._evaluate(trade, high, low);
      if (!result) continue;

      // Trade closed — remove from tracking
      this.openTrades.delete(accountId);

      log.trade(TAG, `Trade closed for "${trade.label}": ${result.outcome.toUpperCase()} @ ${result.exitPrice}`);
      log.trade(TAG, `  P&L: $${result.pnl >= 0 ? "+" : ""}${result.pnl}  new_balance=$${result.newBalance}`);

      this.emit("trade_closed", { trade, result });
    }
  }

  // ─────────────────────────────────────────────────────────
  // _evaluate — Check one trade against candle H/L
  // ─────────────────────────────────────────────────────────
  _evaluate(trade, high, low) {
    const { direction, entry, stop, target, contracts, prevBalance } = trade;

    let outcome   = null;
    let exitPrice = null;

    if (direction === "buy") {
      // Long trade: TP is above entry, SL is below
      if (high >= target && low <= stop) {
        // Both hit in same candle — price was volatile.
        // Assume TP (more favorable, and upward breakout implies bullish momentum).
        // The user can manually correct the rare edge case.
        outcome   = "tp";
        exitPrice = target;
        log.warn(TAG, `"${trade.label}" — both TP and SL hit in same candle; assuming TP`);
      } else if (high >= target) {
        outcome   = "tp";
        exitPrice = target;
      } else if (low <= stop) {
        outcome   = "sl";
        exitPrice = stop;
      }
    } else {
      // Short trade: TP is below entry, SL is above
      if (low <= target && high >= stop) {
        outcome   = "tp";
        exitPrice = target;
        log.warn(TAG, `"${trade.label}" — both TP and SL hit in same candle; assuming TP`);
      } else if (low <= target) {
        outcome   = "tp";
        exitPrice = target;
      } else if (high >= stop) {
        outcome   = "sl";
        exitPrice = stop;
      }
    }

    if (!outcome) return null;

    // ── Exact P&L calculation ──────────────────────────────
    // NQ: 1 point = $20  (config.pointValue)
    // P&L = (exitPrice - entry) × direction_sign × contracts × pointValue
    const pointsMoved = direction === "buy"
      ? exitPrice - entry
      : entry - exitPrice;

    const pnl        = Math.round(pointsMoved * contracts * config.pointValue * 100) / 100;
    const newBalance = Math.round((prevBalance + pnl) * 100) / 100;

    return {
      outcome,      // "tp" | "sl"
      exitPrice,
      pointsMoved,
      pnl,          // signed dollars
      newBalance,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────

  /** How many trades are currently being tracked */
  get size() {
    return this.openTrades.size;
  }

  /** Returns array of all open trades (for /api/status) */
  getOpenTrades() {
    return Array.from(this.openTrades.values()).map((t) => ({
      accountId:   t.accountId,
      label:       t.label,
      direction:   t.direction,
      entry:       t.entry,
      stop:        t.stop,
      target:      t.target,
      contracts:   t.contracts,
      prevBalance: t.prevBalance,
      session:     t.session,
      openedAt:    t.openedAt,
    }));
  }

  /** Manually close a trade (e.g. if session ends and trade is still open) */
  cancelTrade(accountId) {
    const trade = this.openTrades.get(accountId);
    if (trade) {
      this.openTrades.delete(accountId);
      log.warn(TAG, `Trade for "${trade.label}" manually cancelled from tracker (no journal write)`);
    }
  }
}

// Singleton — shared across the whole server
export const tradeTracker = new TradeTracker();
