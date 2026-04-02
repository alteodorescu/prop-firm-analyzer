import "dotenv/config";

export const config = {
  // ── Supabase ──
  supabaseUrl: process.env.SUPABASE_URL || "https://edmtgqzhnergrfllupwz.supabase.co",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",

  // ── Data Feed ──
  feedType: process.env.FEED_TYPE || "mock", // "mock" | "dxfeed" | "databento"
  dxfeedWsUrl: process.env.DXFEED_WS_URL || "",
  dxfeedAuthToken: process.env.DXFEED_AUTH_TOKEN || "",
  databentoBridgePort: parseInt(process.env.DATABENTO_BRIDGE_PORT || "3002", 10),

  // ── Symbol ──
  symbol: process.env.SYMBOL || "NQM6",

  // ── ORB Session Windows (UTC) ──
  londonOrStart: process.env.LONDON_OR_START || "08:00",
  londonOrEnd: process.env.LONDON_OR_END || "08:15",
  nyOrStart: process.env.NY_OR_START || "14:30",
  nyOrEnd: process.env.NY_OR_END || "14:45",

  // ── ORB Strategy ──
  orbTargetMultiplier: parseFloat(process.env.ORB_TARGET_MULTIPLIER || "1.0"),
  orbMaxRiskPoints: parseFloat(process.env.ORB_MAX_RISK_POINTS || "40"),
  tickValue: parseFloat(process.env.TICK_VALUE || "5.00"),    // NQ tick = $5 (0.25 points)
  pointValue: parseFloat(process.env.POINT_VALUE || "20.00"), // NQ 1 point = $20

  // ── PickMyTrade ──
  pickmytradeEnabled: process.env.PICKMYTRADE_ENABLED === "true",
  pickmytradeWebhookUrl: process.env.PICKMYTRADE_WEBHOOK_URL || "",

  // ── Server ──
  port: parseInt(process.env.PORT || "3001", 10),
};
