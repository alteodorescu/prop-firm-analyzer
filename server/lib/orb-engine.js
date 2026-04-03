// ═══════════════════════════════════════════════════════════
// ORB ENGINE — Opening Range Breakout Detection
// ═══════════════════════════════════════════════════════════
//
// Strategy:
//   1. Session opens (London 07:00 UTC, NY 13:30 UTC)
//   2. The FIRST closed 5-min candle sets the Opening Range (high/low)
//   3. Watch subsequent 5-min candles. When a candle CLOSES more than
//      50 ticks (12.5 pts) beyond the OR, a breakout is confirmed.
//   4. Entry = OPEN of the NEXT 5-min candle after the breakout candle.
//
// TradingView alert must be on a 5-min chart, "Once Per Bar Close":
//   Message: {"open":{{open}},"high":{{high}},"low":{{low}},"close":{{close}}}
//
// ═══════════════════════════════════════════════════════════

import { EventEmitter } from "events";
import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "ORB";

// Breakout confirmation: 0 ticks — any close beyond OR high/low triggers
const BREAKOUT_TICKS = 0;
const BREAKOUT_POINTS = 0;

/**
 * Parse "HH:MM" → total minutes since midnight
 */
function parseTimeMin(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Get UTC minutes-since-midnight from a Date
 */
function utcMinutes(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

// ─────────────────────────────────────────────────────────
// OrbSession — Handles one session (London or NY)
// ─────────────────────────────────────────────────────────
class OrbSession {
  constructor(name, startStr, endStr) {
    this.name = name;
    this.startMin = parseTimeMin(startStr);
    this.endMin = parseTimeMin(endStr); // session expiry (no breakout → give up)
    this.reset();
  }

  reset() {
    // States: waiting → or_forming (3 candles) → watching → awaiting_entry → triggered | done
    this.state = "waiting";
    this.orHigh = null;
    this.orLow = null;
    this.orCandleCount = 0;   // counts candles during OR formation (target: 3)
    this.breakoutDirection = null;
    this.lastDate = null;
  }

  /**
   * Process a 5-min bar (called once per closed candle from TradingView)
   *
   * @param {{ open: number, high: number, low: number, close: number }} candle
   * @param {Date} timestamp
   * @returns {object|null} Signal if entry triggered, else null
   */
  processTick(candle, timestamp) {
    const { open, high, low, close } = candle;
    const now = utcMinutes(timestamp);
    const today = timestamp.toISOString().slice(0, 10);

    // ── Daily reset ──
    if (this.lastDate && this.lastDate !== today) {
      log.info(TAG, `${this.name} new day — resetting ORB state`);
      this.reset();
    }
    this.lastDate = today;

    // ── STATE: waiting — before session start ──
    if (this.state === "waiting") {
      if (now === this.startMin) {
        // This candle CLOSED at session start → it opened BEFORE the session (e.g. 06:55–07:00)
        // Skip it — the next candle will open exactly at session start
        log.info(TAG, `${this.name} session boundary candle skipped (opened before session, closes at ${this.startMin} UTC min)`);
      } else if (now > this.startMin) {
        // First candle that opened AT session start — begin OR formation
        this.orHigh = high;
        this.orLow = low;
        this.orCandleCount = 1;
        log.signal(TAG, `${this.name} OR candle 1/3: O=${open} H=${high} L=${low} C=${close}`);
        this.state = "or_forming";
      }
      return null;
    }

    // ── STATE: or_forming — collecting the first 3 candles ──
    if (this.state === "or_forming") {
      this.orCandleCount++;
      this.orHigh = Math.max(this.orHigh, high);
      this.orLow  = Math.min(this.orLow, low);
      log.signal(TAG, `${this.name} OR candle ${this.orCandleCount}/3: O=${open} H=${high} L=${low} C=${close} | Running OR: ${this.orLow}–${this.orHigh}`);

      if (this.orCandleCount >= 3) {
        const range = (this.orHigh - this.orLow).toFixed(2);
        log.signal(TAG, `${this.name} OR LOCKED: High=${this.orHigh} Low=${this.orLow} Range=${range}pts`);

        if (this.orHigh - this.orLow <= 0) {
          log.warn(TAG, `${this.name} OR range is zero after 3 candles — skipping session`);
          this.state = "done";
          return null;
        }

        this.state = "watching";
        return { type: "or_set", session: this.name, orHigh: this.orHigh, orLow: this.orLow };
      }
      return null;
    }

    // ── Session expiry ──
    if (now >= this.endMin && this.state !== "triggered" && this.state !== "done") {
      log.warn(TAG, `${this.name} session expired at ${now} UTC mins — no breakout`);
      this.state = "done";
      return null;
    }

    // ── STATE: watching — check each closed candle for a confirmed breakout ──
    if (this.state === "watching") {
      const longBreakout = close > this.orHigh + BREAKOUT_POINTS;
      const shortBreakout = close < this.orLow - BREAKOUT_POINTS;

      if (longBreakout) {
        log.trade(TAG, `${this.name} LONG breakout candle closed at ${close}`);
        log.trade(TAG, `  OR High=${this.orHigh} + ${BREAKOUT_POINTS}pts = ${this.orHigh + BREAKOUT_POINTS} | Close=${close}`);
        this.breakoutDirection = "buy";
        this.state = "awaiting_entry";
        return null; // Wait for next candle's open
      }

      if (shortBreakout) {
        log.trade(TAG, `${this.name} SHORT breakout candle closed at ${close}`);
        log.trade(TAG, `  OR Low=${this.orLow} - ${BREAKOUT_POINTS}pts = ${this.orLow - BREAKOUT_POINTS} | Close=${close}`);
        this.breakoutDirection = "sell";
        this.state = "awaiting_entry";
        return null; // Wait for next candle's open
      }

      return null;
    }

    // ── STATE: awaiting_entry — this is the candle AFTER the breakout ──
    // Entry = open of this candle
    if (this.state === "awaiting_entry") {
      const entry = open;
      const orRange = parseFloat((this.orHigh - this.orLow).toFixed(2));
      this.state = "triggered";

      log.trade(TAG, `${this.name} ${this.breakoutDirection.toUpperCase()} ENTRY at ${entry} (open of next candle)`);
      log.trade(TAG, `  OR High=${this.orHigh} | OR Low=${this.orLow} | Range=${orRange}pts`);

      return {
        type: "signal",
        session: this.name,
        direction: this.breakoutDirection,
        entry,
        orHigh: this.orHigh,
        orLow: this.orLow,
        orRange,
        timestamp,
      };
    }

    // triggered / done — no more signals today
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// ORB Engine — Manages London + NY sessions
// ─────────────────────────────────────────────────────────
export class OrbEngine extends EventEmitter {
  constructor() {
    super();

    this.londonSession = new OrbSession("London", config.londonOrStart, config.londonOrEnd);
    this.nySession = new OrbSession("NY", config.nyOrStart, config.nyOrEnd);

    log.info(TAG, `London OR: ${config.londonOrStart} UTC (expires ${config.londonOrEnd} UTC)`);
    log.info(TAG, `NY OR:     ${config.nyOrStart} UTC (expires ${config.nyOrEnd} UTC)`);
    log.info(TAG, `Breakout confirmation: ${BREAKOUT_TICKS} ticks (${BREAKOUT_POINTS}pts) beyond OR`);
  }

  /**
   * Process a 5-min candle tick from the data feed.
   * Each tick must carry { open, high, low, close } (from TradingView 5-min alert).
   *
   * @param {{ open: number, high: number, low: number, close: number, timestamp: Date, symbol: string }} tick
   */
  processTick(tick) {
    const { open, high, low, close, price, timestamp } = tick;

    // Build a complete candle — fall back to price if OHLC not provided
    const candle = {
      open:  open  ?? price,
      high:  high  ?? price,
      low:   low   ?? price,
      close: close ?? price,
    };

    const londonResult = this.londonSession.processTick(candle, timestamp);
    if (londonResult?.type === "or_set") this.emit("or_set", londonResult);
    if (londonResult?.type === "signal") this.emit("signal", londonResult);

    const nyResult = this.nySession.processTick(candle, timestamp);
    if (nyResult?.type === "or_set") this.emit("or_set", nyResult);
    if (nyResult?.type === "signal") this.emit("signal", nyResult);
  }

  /**
   * Get current state summary for the /api/status endpoint
   */
  getStatus() {
    return {
      london: {
        state: this.londonSession.state,
        orHigh: this.londonSession.orHigh,
        orLow: this.londonSession.orLow,
        orCandleCount: this.londonSession.orCandleCount,
      },
      ny: {
        state: this.nySession.state,
        orHigh: this.nySession.orHigh,
        orLow: this.nySession.orLow,
        orCandleCount: this.nySession.orCandleCount,
      },
    };
  }
}
