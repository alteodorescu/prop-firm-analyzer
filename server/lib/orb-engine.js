// ═══════════════════════════════════════════════════════════
// ORB ENGINE — Opening Range Breakout Detection
// ═══════════════════════════════════════════════════════════
// Monitors price data, identifies Opening Ranges for London
// and NY sessions, and emits signals on breakout.
// ═══════════════════════════════════════════════════════════

import { EventEmitter } from "events";
import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "ORB";

/**
 * Parse "HH:MM" → { hours, minutes }
 */
function parseTime(str) {
  const [h, m] = str.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Get minutes-since-midnight from a Date (UTC)
 */
function utcMinutes(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/**
 * Session definition
 */
function createSession(name, startStr, endStr) {
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  return {
    name,
    startMin: start.hours * 60 + start.minutes,
    endMin: end.hours * 60 + end.minutes,
  };
}

/**
 * ORB state for a single session
 */
class OrbSession {
  constructor(session) {
    this.session = session;
    this.reset();
  }

  reset() {
    this.state = "waiting"; // waiting | forming | watching | triggered | done
    this.orHigh = -Infinity;
    this.orLow = Infinity;
    this.breakoutDirection = null;
    this.entryPrice = null;
    this.stopPrice = null;
    this.targetPrice = null;
    this.lastDate = null; // Track which day we're on
  }

  /**
   * Process a tick and return a signal if breakout detected
   * @param {number} price
   * @param {Date} timestamp
   * @returns {object|null} Signal object or null
   */
  processTick(price, timestamp) {
    const now = utcMinutes(timestamp);
    const today = timestamp.toISOString().slice(0, 10);

    // Reset on new day
    if (this.lastDate && this.lastDate !== today) {
      this.reset();
    }
    this.lastDate = today;

    const { startMin, endMin, name } = this.session;

    // ── STATE: waiting ──
    // Before the OR window opens
    if (this.state === "waiting") {
      if (now >= startMin && now < endMin) {
        this.state = "forming";
        this.orHigh = price;
        this.orLow = price;
        log.info(TAG, `${name} Opening Range forming... first price: ${price}`);
      }
      return null;
    }

    // ── STATE: forming ──
    // During the OR window — track high/low
    if (this.state === "forming") {
      if (now < endMin) {
        if (price > this.orHigh) this.orHigh = price;
        if (price < this.orLow) this.orLow = price;
        return null;
      }

      // OR window just closed
      const range = this.orHigh - this.orLow;
      log.signal(TAG, `${name} Opening Range set: High=${this.orHigh} Low=${this.orLow} Range=${range.toFixed(2)}pts`);

      // Validate range
      if (range <= 0 || range > config.orbMaxRiskPoints) {
        log.warn(TAG, `${name} Range ${range.toFixed(2)}pts exceeds max risk (${config.orbMaxRiskPoints}pts) or is zero. Skipping.`);
        this.state = "done";
        return null;
      }

      this.state = "watching";
      // Fall through to check current price against range
    }

    // ── STATE: watching ──
    // After OR closed — waiting for breakout
    if (this.state === "watching") {
      const range = this.orHigh - this.orLow;

      // Breakout LONG — price exceeds OR high
      if (price > this.orHigh) {
        this.state = "triggered";
        this.breakoutDirection = "buy";
        this.entryPrice = price;

        log.trade(TAG, `${name} LONG BREAKOUT at ${price}`);
        log.trade(TAG, `  OR High: ${this.orHigh} | OR Low: ${this.orLow} | Range: ${range.toFixed(2)}pts`);

        // Signal only carries direction + entry. Stop/target are set by the risk engine
        // based on each account's Today's Trading Plan.
        return {
          session: name,
          direction: "buy",
          entry: this.entryPrice,
          orHigh: this.orHigh,
          orLow: this.orLow,
          orRange: parseFloat(range.toFixed(2)),
          timestamp,
        };
      }

      // Breakout SHORT — price drops below OR low
      if (price < this.orLow) {
        this.state = "triggered";
        this.breakoutDirection = "sell";
        this.entryPrice = price;

        log.trade(TAG, `${name} SHORT BREAKOUT at ${price}`);
        log.trade(TAG, `  OR High: ${this.orHigh} | OR Low: ${this.orLow} | Range: ${range.toFixed(2)}pts`);

        return {
          session: name,
          direction: "sell",
          entry: this.entryPrice,
          orHigh: this.orHigh,
          orLow: this.orLow,
          orRange: parseFloat(range.toFixed(2)),
          timestamp,
        };
      }

      return null;
    }

    // ── STATE: triggered / done ──
    // Already fired for this session today
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// ORB Engine — Manages both sessions
// ─────────────────────────────────────────────────────────
export class OrbEngine extends EventEmitter {
  constructor() {
    super();

    this.londonSession = new OrbSession(
      createSession("London", config.londonOrStart, config.londonOrEnd)
    );
    this.nySession = new OrbSession(
      createSession("NY", config.nyOrStart, config.nyOrEnd)
    );

    log.info(TAG, `London OR: ${config.londonOrStart}-${config.londonOrEnd} UTC`);
    log.info(TAG, `NY OR: ${config.nyOrStart}-${config.nyOrEnd} UTC`);
  }

  /**
   * Process a price tick from the data feed
   * @param {{ price: number, timestamp: Date, symbol: string }} tick
   */
  processTick(tick) {
    const { price, timestamp } = tick;

    // Check London session
    const londonSignal = this.londonSession.processTick(price, timestamp);
    if (londonSignal) {
      this.emit("signal", londonSignal);
    }

    // Check NY session
    const nySignal = this.nySession.processTick(price, timestamp);
    if (nySignal) {
      this.emit("signal", nySignal);
    }
  }

  /**
   * Get current state summary
   */
  getStatus() {
    return {
      london: {
        state: this.londonSession.state,
        orHigh: this.londonSession.orHigh === -Infinity ? null : this.londonSession.orHigh,
        orLow: this.londonSession.orLow === Infinity ? null : this.londonSession.orLow,
      },
      ny: {
        state: this.nySession.state,
        orHigh: this.nySession.orHigh === -Infinity ? null : this.nySession.orHigh,
        orLow: this.nySession.orLow === Infinity ? null : this.nySession.orLow,
      },
    };
  }
}
