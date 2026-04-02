// ═══════════════════════════════════════════════════════════
// DATA FEED — Pluggable price data source
// ═══════════════════════════════════════════════════════════
// Supports: "mock" (simulated data) and "dxfeed" (real-time)
// Both emit the same event format: { price, timestamp, symbol }
// ═══════════════════════════════════════════════════════════

import { EventEmitter } from "events";
import WebSocket from "ws";
import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "FEED";

// ─────────────────────────────────────────────────────────
// Base Feed Interface
// ─────────────────────────────────────────────────────────
class DataFeed extends EventEmitter {
  constructor() {
    super();
    this.lastPrice = null;
    this.connected = false;
  }

  /** Override in subclass */
  async connect() {
    throw new Error("connect() not implemented");
  }

  async disconnect() {
    this.connected = false;
  }

  /** Emit a normalized tick */
  emitTick(price, timestamp) {
    this.lastPrice = price;
    this.emit("tick", {
      price,
      timestamp: timestamp || new Date(),
      symbol: config.symbol,
    });
  }
}

// ─────────────────────────────────────────────────────────
// Mock Feed — Simulates NQ price action for testing
// ─────────────────────────────────────────────────────────
class MockFeed extends DataFeed {
  constructor() {
    super();
    this.interval = null;
    this.basePrice = 18400;
    this.price = this.basePrice;
    this.tickCount = 0;
    // Simulated time — starts at 07:55 UTC to test London ORB
    this.simTime = new Date();
    this.simTime.setUTCHours(7, 55, 0, 0);
  }

  async connect() {
    log.info(TAG, "Mock feed connected — simulating NQ price action");
    log.info(TAG, `Starting simulated time: ${this.simTime.toISOString()}`);
    this.connected = true;

    // Emit a tick every 500ms (simulates ~2 ticks/sec)
    // Each tick advances simulated time by 15 seconds
    this.interval = setInterval(() => {
      this.tickCount++;
      this.simTime = new Date(this.simTime.getTime() + 15000); // +15 sec per tick

      // Generate realistic-ish price movement
      const trend = this.getTrend();
      const noise = (Math.random() - 0.5) * 4; // +/- 2 points
      this.price = Math.round((this.price + trend + noise) * 4) / 4; // Round to 0.25 (NQ tick)

      this.emitTick(this.price, this.simTime);
    }, 500);
  }

  /** Create a pattern: range during OR, then breakout */
  getTrend() {
    const h = this.simTime.getUTCHours();
    const m = this.simTime.getUTCMinutes();
    const timeMin = h * 60 + m;

    // 8:00-8:15 London OR — range-bound, small moves
    if (timeMin >= 480 && timeMin < 495) return (Math.random() - 0.5) * 1;

    // 8:15-8:30 — breakout upward (simulated)
    if (timeMin >= 495 && timeMin < 510) return 1.5 + Math.random() * 0.5;

    // 8:30-14:30 — quiet drift
    if (timeMin >= 510 && timeMin < 870) return (Math.random() - 0.5) * 0.5;

    // 14:30-14:45 NY OR — range-bound
    if (timeMin >= 870 && timeMin < 885) return (Math.random() - 0.5) * 1;

    // 14:45-15:00 — breakout downward (simulated)
    if (timeMin >= 885 && timeMin < 900) return -1.5 - Math.random() * 0.5;

    return (Math.random() - 0.5) * 0.3;
  }

  async disconnect() {
    if (this.interval) clearInterval(this.interval);
    this.connected = false;
    log.info(TAG, "Mock feed disconnected");
  }
}

// ─────────────────────────────────────────────────────────
// dxFeed — Real-time data via WebSocket
// ─────────────────────────────────────────────────────────
class DxFeed extends DataFeed {
  constructor() {
    super();
    this.ws = null;
    this.reconnectDelay = 5000;
  }

  async connect() {
    const url = config.dxfeedWsUrl;
    const token = config.dxfeedAuthToken;

    if (!url) {
      log.error(TAG, "DXFEED_WS_URL not configured");
      return;
    }

    log.info(TAG, `Connecting to dxFeed: ${url}`);

    this.ws = new WebSocket(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    this.ws.on("open", () => {
      log.info(TAG, "dxFeed WebSocket connected");
      this.connected = true;

      // Subscribe to Trade events for the configured symbol
      // dxLink protocol: send setup, then subscribe
      this.ws.send(
        JSON.stringify({
          type: "SETUP",
          channel: 0,
          version: "0.1-js/1.0.0",
          keepaliveTimeout: 60,
          acceptKeepaliveTimeout: 60,
        })
      );
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleDxMessage(msg);
      } catch (e) {
        // Binary or non-JSON message
      }
    });

    this.ws.on("close", () => {
      log.warn(TAG, `dxFeed disconnected. Reconnecting in ${this.reconnectDelay / 1000}s...`);
      this.connected = false;
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on("error", (err) => {
      log.error(TAG, "dxFeed WebSocket error:", err.message);
    });
  }

  handleDxMessage(msg) {
    // dxLink feed data format — adjust based on your dxFeed subscription format
    // Common formats: { type: "FEED_DATA", data: [...] }
    if (msg.type === "SETUP") {
      // After setup, open a channel and subscribe
      this.ws.send(
        JSON.stringify({
          type: "CHANNEL_REQUEST",
          channel: 1,
          service: "FEED",
          parameters: { contract: "AUTO" },
        })
      );
      return;
    }

    if (msg.type === "CHANNEL_OPENED" && msg.channel === 1) {
      // Subscribe to Trade events for our symbol
      this.ws.send(
        JSON.stringify({
          type: "FEED_SUBSCRIPTION",
          channel: 1,
          add: [{ type: "Trade", symbol: config.symbol }],
        })
      );
      log.info(TAG, `Subscribed to ${config.symbol} Trade events`);
      return;
    }

    if (msg.type === "FEED_DATA" && msg.channel === 1) {
      // Parse trade data
      const data = msg.data;
      if (Array.isArray(data)) {
        // dxLink format: [eventType, [field1, field2, ...]]
        // Trade fields typically: eventSymbol, eventTime, price, size, ...
        for (let i = 0; i < data.length; i++) {
          if (data[i] === "Trade" && Array.isArray(data[i + 1])) {
            const fields = data[i + 1];
            // fields[0] = eventSymbol, fields[2] = price (varies by schema)
            // Adjust indices based on your actual dxFeed schema
            const price = parseFloat(fields[2] || fields[1]);
            if (!isNaN(price) && price > 0) {
              this.emitTick(price, new Date());
            }
            i++; // Skip the array we just processed
          }
        }
      }
      return;
    }
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    log.info(TAG, "dxFeed disconnected");
  }
}

// ─────────────────────────────────────────────────────────
// Factory — Create the right feed based on config
// ─────────────────────────────────────────────────────────
export function createFeed() {
  switch (config.feedType) {
    case "dxfeed":
      return new DxFeed();
    case "mock":
    default:
      return new MockFeed();
  }
}
