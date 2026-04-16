// =============================================================================
//  UnifiedOrbStrategy.cs
//
//  NQ Opening Range Breakout strategy. Designed to drive a Tradesyncer master
//  account that fans out to multiple prop-firm follower accounts.
//
//  Two deployment modes (both use the SAME strategy file — only parameter values
//  differ, usually one instance per mode):
//
//    1. Unified mode
//         One strategy instance fires a single plan. Tradesyncer mirrors every
//         fill to ALL connected followers. Parameter values come from the
//         "Trade Copier — Unified Daily Objective" card in the React app
//         (prop-firm-analyzer / Account Tracker tab), which already computes:
//           - unified target $  → TP points  = target / contracts / 20
//           - unified contracts
//           - unified max loss  → "MaxDailyLoss" input directly
//
//    2. Per-group mode
//         Run multiple strategy instances in parallel, each attached to a
//         different Tradesyncer master account. Example: one master feeds the
//         Apex-group followers, another feeds the Lucid-group followers. Use
//         the group filter in the React app to compute group-specific params.
//
//  The strategy itself has zero knowledge of "unified vs group" — that's a
//  deployment concept. It only cares about the parameter values you give it.
//
//  Requirements:
//    - NinjaTrader 8
//    - NQ (Nasdaq-100 E-mini) 1-minute chart recommended
//    - Instrument configured with session template that covers globex hours
//
//  Notes on timezones:
//    - Strategy operates in ET (America/New_York) internally.
//    - Time[0] is converted from the chart's local time zone to ET.
//    - If your NinjaTrader time zone isn't the system local, adjust accordingly
//      or use a chart set to your local system time.
//
// =============================================================================

#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{
    /// <summary>Which sessions this instance should trade.</summary>
    public enum SessionChoice
    {
        London,
        NewYork,
        Both
    }

    /// <summary>How to place the protective stop.</summary>
    public enum StopLossMode
    {
        /// <summary>Stop at the opposite side of the opening range (conservative).</summary>
        OrOpposite,
        /// <summary>Stop at a fixed point distance from entry (aggressive).</summary>
        FixedPoints
    }

    public class UnifiedOrbStrategy : Strategy
    {
        // ────────────────────────────────────────────────────────────────────
        //  User inputs (shown in NinjaTrader's Strategy parameters UI)
        // ────────────────────────────────────────────────────────────────────

        [NinjaScriptProperty]
        [Display(Name = "Profile name", Description = "Label for this instance (e.g. \"Unified\", \"Apex-NY\", \"Lucid-London\"). Shown in logs.", Order = 1, GroupName = "1. Identity")]
        public string ProfileName { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Session", Description = "Which session(s) to trade.", Order = 2, GroupName = "2. Session")]
        public SessionChoice SessionMode { get; set; }

        [NinjaScriptProperty]
        [Range(1, 120)]
        [Display(Name = "Opening range (minutes)", Description = "How many minutes after the session open to measure the opening range high/low.", Order = 3, GroupName = "2. Session")]
        public int OpeningRangeMinutes { get; set; }

        [NinjaScriptProperty]
        [Range(1, 60)]
        [Display(Name = "Session exit buffer (min)", Description = "Flatten any open position this many minutes before session close.", Order = 4, GroupName = "2. Session")]
        public int SessionExitBufferMinutes { get; set; }

        [NinjaScriptProperty]
        [Range(1, 100)]
        [Display(Name = "Contracts", Description = "Position size. Use the minimum across all accounts being copied to.", Order = 5, GroupName = "3. Sizing")]
        public int Contracts { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 500.0)]
        [Display(Name = "Take profit (points)", Description = "Take-profit distance in NQ points. For Unified mode: target $ ÷ contracts ÷ $20.", Order = 6, GroupName = "3. Sizing")]
        public double TpPoints { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Stop loss mode", Description = "OrOpposite = stop at the far side of the opening range. FixedPoints = stop at a fixed point distance from entry.", Order = 7, GroupName = "3. Sizing")]
        public StopLossMode SlMode { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 500.0)]
        [Display(Name = "Stop loss fixed points", Description = "Used only when Stop loss mode = FixedPoints.", Order = 8, GroupName = "3. Sizing")]
        public double SlFixedPoints { get; set; }

        [NinjaScriptProperty]
        [Range(0, 100000)]
        [Display(Name = "Max daily loss ($)", Description = "Hard stop. If realized daily P&L drops to this amount below zero, the strategy halts for the rest of the trading day. 0 = disabled.", Order = 9, GroupName = "4. Risk")]
        public double MaxDailyLoss { get; set; }

        // ────────────────────────────────────────────────────────────────────
        //  Session times (ET)
        // ────────────────────────────────────────────────────────────────────

        private static readonly TimeSpan LondonOpen  = new TimeSpan(3, 0, 0);
        private static readonly TimeSpan LondonClose = new TimeSpan(11, 30, 0);
        private static readonly TimeSpan NewYorkOpen = new TimeSpan(9, 30, 0);
        private static readonly TimeSpan NewYorkClose = new TimeSpan(16, 0, 0);

        // ────────────────────────────────────────────────────────────────────
        //  Internal state
        // ────────────────────────────────────────────────────────────────────

        private TimeZoneInfo   etZone;
        private DateTime       lastDay = DateTime.MinValue;
        private bool           londonDone;
        private bool           newYorkDone;
        private bool           haltedForDay;
        private double         orHigh;
        private double         orLow;
        private SessionChoice? currentOrSession;
        private MarketPosition lastPosition = MarketPosition.Flat;
        private double         dailyRealizedPnl;

        // ────────────────────────────────────────────────────────────────────
        //  Lifecycle
        // ────────────────────────────────────────────────────────────────────

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name                                = "UnifiedOrbStrategy";
                Description                         = "NQ Opening Range Breakout — parameterized for Unified or per-group Tradesyncer copy-trading.";
                Calculate                           = Calculate.OnBarClose;
                EntriesPerDirection                 = 1;
                EntryHandling                       = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy        = true;
                ExitOnSessionCloseSeconds           = 30;
                IsFillLimitOnTouch                  = false;
                MaximumBarsLookBack                 = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution                 = OrderFillResolution.Standard;
                Slippage                            = 0;
                StartBehavior                       = StartBehavior.WaitUntilFlat;
                TimeInForce                         = TimeInForce.Gtc;
                TraceOrders                         = false;
                RealtimeErrorHandling               = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling                  = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade                 = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Parameter defaults
                ProfileName               = "Unified";
                SessionMode               = SessionChoice.NewYork;
                OpeningRangeMinutes       = 15;
                SessionExitBufferMinutes  = 5;
                Contracts                 = 2;
                TpPoints                  = 15.0;
                SlMode                    = StopLossMode.OrOpposite;
                SlFixedPoints             = 10.0;
                MaxDailyLoss              = 500.0;
            }
            else if (State == State.Configure)
            {
                try
                {
                    etZone = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
                }
                catch
                {
                    try { etZone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York"); }
                    catch
                    {
                        etZone = TimeZoneInfo.Utc;
                        Print("[UnifiedORB] WARN: Eastern time zone not found — falling back to UTC. Session times will be wrong!");
                    }
                }
            }
            else if (State == State.Realtime)
            {
                Print($"[{ProfileName}] ORB strategy LIVE | Session={SessionMode} | OR={OpeningRangeMinutes}m | Contracts={Contracts} | TP={TpPoints}pt | SL={(SlMode == StopLossMode.OrOpposite ? "OR-opposite" : $"{SlFixedPoints}pt fixed")} | MaxLoss={MaxDailyLoss:C}");
            }
        }

        // ────────────────────────────────────────────────────────────────────
        //  Main loop
        // ────────────────────────────────────────────────────────────────────

        protected override void OnBarUpdate()
        {
            if (CurrentBar < BarsRequiredToTrade) return;

            DateTime etNow  = ToEt(Time[0]);
            DateTime today  = etNow.Date;
            TimeSpan tod    = etNow.TimeOfDay;

            // New trading day → reset daily state
            if (today != lastDay)
            {
                lastDay          = today;
                dailyRealizedPnl = 0;
                haltedForDay     = false;
                londonDone       = false;
                newYorkDone      = false;
                currentOrSession = null;
                Print($"[{ProfileName}] ── New trading day: {today:yyyy-MM-dd} ──");
            }

            if (haltedForDay) return;

            // Determine which session (if any) this bar belongs to
            SessionChoice? sess = DetermineSession(tod);
            if (!sess.HasValue) return;

            // Is this session enabled for this instance?
            bool enabled = SessionMode == SessionChoice.Both || SessionMode == sess.Value;
            if (!enabled) return;

            // Skip if already traded this session today
            if (sess.Value == SessionChoice.London   && londonDone)  return;
            if (sess.Value == SessionChoice.NewYork  && newYorkDone) return;

            TimeSpan openTod   = sess.Value == SessionChoice.London ? LondonOpen  : NewYorkOpen;
            TimeSpan closeTod  = sess.Value == SessionChoice.London ? LondonClose : NewYorkClose;
            DateTime sessionOpen  = today + openTod;
            DateTime sessionClose = today + closeTod;
            DateTime orEnd        = sessionOpen.AddMinutes(OpeningRangeMinutes);
            DateTime flattenBy    = sessionClose.AddMinutes(-SessionExitBufferMinutes);

            // ── Opening range accumulation ──
            if (etNow >= sessionOpen && etNow < orEnd)
            {
                if (currentOrSession != sess)
                {
                    orHigh = High[0];
                    orLow  = Low[0];
                    currentOrSession = sess;
                    Print($"[{ProfileName}] {sess} OR started at {etNow:HH:mm} ET — opening H={orHigh:F2} L={orLow:F2}");
                }
                else
                {
                    if (High[0] > orHigh) orHigh = High[0];
                    if (Low[0]  < orLow)  orLow  = Low[0];
                }
                return;
            }

            // ── Breakout entry window ──
            if (etNow >= orEnd && etNow < flattenBy && Position.MarketPosition == MarketPosition.Flat && currentOrSession == sess)
            {
                string tag    = $"{sess}-{today:yyyyMMdd}";
                int    tpTicks = (int)Math.Round(TpPoints * 4.0);  // NQ: 4 ticks per point

                if (Close[0] > orHigh)
                {
                    double stopPrice = SlMode == StopLossMode.OrOpposite ? orLow : Close[0] - SlFixedPoints;
                    Print($"[{ProfileName}] {sess} LONG breakout — entry~{Close[0]:F2}, TP=+{TpPoints}pt, SL@{stopPrice:F2}");
                    SetStopLoss($"{tag}-L",    CalculationMode.Price, stopPrice, false);
                    SetProfitTarget($"{tag}-L", CalculationMode.Ticks, tpTicks);
                    EnterLong(Contracts, $"{tag}-L");
                    MarkSessionDone(sess.Value);
                }
                else if (Close[0] < orLow)
                {
                    double stopPrice = SlMode == StopLossMode.OrOpposite ? orHigh : Close[0] + SlFixedPoints;
                    Print($"[{ProfileName}] {sess} SHORT breakout — entry~{Close[0]:F2}, TP=+{TpPoints}pt, SL@{stopPrice:F2}");
                    SetStopLoss($"{tag}-S",    CalculationMode.Price, stopPrice, false);
                    SetProfitTarget($"{tag}-S", CalculationMode.Ticks, tpTicks);
                    EnterShort(Contracts, $"{tag}-S");
                    MarkSessionDone(sess.Value);
                }

                return;
            }

            // ── End-of-session flatten ──
            if (etNow >= flattenBy && Position.MarketPosition != MarketPosition.Flat && currentOrSession == sess)
            {
                Print($"[{ProfileName}] {sess} session-end flatten at {etNow:HH:mm} ET");
                ExitLong();
                ExitShort();
            }
        }

        // ────────────────────────────────────────────────────────────────────
        //  Position & P&L tracking
        // ────────────────────────────────────────────────────────────────────

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            // When we transition FROM in-position TO flat, record the closed trade's P&L
            if (lastPosition != MarketPosition.Flat && marketPosition == MarketPosition.Flat)
            {
                var allTrades = SystemPerformance.AllTrades;
                if (allTrades != null && allTrades.Count > 0)
                {
                    var last = allTrades[allTrades.Count - 1];
                    dailyRealizedPnl += last.ProfitCurrency;
                    Print($"[{ProfileName}] Trade closed  |  P&L={last.ProfitCurrency:C}  |  daily total={dailyRealizedPnl:C}");

                    if (MaxDailyLoss > 0 && dailyRealizedPnl <= -MaxDailyLoss)
                    {
                        haltedForDay = true;
                        Print($"[{ProfileName}] !! HALTED FOR DAY !! — daily loss {dailyRealizedPnl:C} reached limit {-MaxDailyLoss:C}");
                    }
                }
            }
            lastPosition = marketPosition;
        }

        // ────────────────────────────────────────────────────────────────────
        //  Helpers
        // ────────────────────────────────────────────────────────────────────

        private DateTime ToEt(DateTime localBarTime)
        {
            // NinjaTrader's Time[0] is in the user's local system time zone for most setups.
            // Convert via UTC → ET. If your NT is configured for a different zone, see README.
            try
            {
                DateTime utc = TimeZoneInfo.ConvertTimeToUtc(localBarTime, TimeZoneInfo.Local);
                return TimeZoneInfo.ConvertTimeFromUtc(utc, etZone);
            }
            catch
            {
                return localBarTime;  // Fallback — shouldn't hit in practice
            }
        }

        private static SessionChoice? DetermineSession(TimeSpan tod)
        {
            if (tod >= LondonOpen  && tod < LondonClose)  return SessionChoice.London;
            if (tod >= NewYorkOpen && tod < NewYorkClose) return SessionChoice.NewYork;
            return null;
        }

        private void MarkSessionDone(SessionChoice sess)
        {
            if (sess == SessionChoice.London) londonDone  = true;
            else                              newYorkDone = true;
        }
    }
}
