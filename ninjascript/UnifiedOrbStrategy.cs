// =============================================================================
//  UnifiedOrbStrategy.cs
//
//  NQ Opening Range Breakout strategy with toggleable filter stack ported from
//  an MT5 Expert Advisor. Designed to drive a Tradesyncer master account that
//  fans out to multiple prop-firm follower accounts.
//
//  Two deployment modes (both use the SAME strategy file — only parameter
//  values differ, usually one instance per mode):
//
//    1. Unified mode
//         One strategy instance fires a single plan. Tradesyncer mirrors every
//         fill to ALL connected followers. Parameter values come from the
//         "Trade Copier — Unified Daily Objective" card in the React app
//         (prop-firm-analyzer / Account Tracker tab).
//
//    2. Per-group mode
//         Run multiple strategy instances in parallel, each attached to a
//         different Tradesyncer master account. Use the group filter in the
//         React app to compute group-specific parameters.
//
//  When all filter toggles are OFF and StopLossMode != POC and the exit
//  features are disabled, behavior matches the original simple ORB. Enabling
//  the filters layers the MT5 EA's edge on top (trend / ADX / candle quality).
//
//  Multi-timeframe data (added via AddDataSeries in Configure):
//    [0] primary 1-min (chart timeframe — the breakout timeframe)
//    [1] 1-min       — for POC calculation (session volume profile)
//    [2] 60-min (H1) — for ADX regime filter
//    [3] 240-min(H4) — for EMA trend filter
//
//  Requirements:
//    - NinjaTrader 8
//    - NQ (Nasdaq-100 E-mini) 1-minute chart
//    - Instrument session template that covers globex hours
//
// =============================================================================

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Media;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
using NinjaTrader.NinjaScript.Indicators;
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
        FixedPoints,
        /// <summary>Stop at session volume Point-of-Control ± offset (ported from MT5 EA).</summary>
        POC
    }

    /// <summary>Position sizing model.</summary>
    public enum SizingMode
    {
        /// <summary>Fixed contract count (recommended for trade-copier determinism).</summary>
        FixedContracts,
        /// <summary>Contracts computed from risk% of cash value and SL distance.</summary>
        RiskPercent
    }

    public class UnifiedOrbStrategy : Strategy
    {
        // ════════════════════════════════════════════════════════════════════
        //  1. IDENTITY
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Profile name", Description = "Label for this instance (e.g. \"Unified\", \"Apex-NY\"). Shown in logs and Telegram alerts.", Order = 1, GroupName = "1. Identity")]
        public string ProfileName { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  2. SESSION
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Session", Description = "Which session(s) to trade.", Order = 1, GroupName = "2. Session")]
        public SessionChoice SessionMode { get; set; }

        [NinjaScriptProperty]
        [Range(1, 120)]
        [Display(Name = "Opening range (minutes)", Description = "Minutes after session open used to measure the OR high/low.", Order = 2, GroupName = "2. Session")]
        public int OpeningRangeMinutes { get; set; }

        [NinjaScriptProperty]
        [Range(1, 60)]
        [Display(Name = "Session exit buffer (min)", Description = "Flatten any open position this many minutes before session close.", Order = 3, GroupName = "2. Session")]
        public int SessionExitBufferMinutes { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  3. SIZING
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Sizing mode", Description = "FixedContracts = always use the Contracts input. RiskPercent = size per-trade from account balance and SL distance.", Order = 1, GroupName = "3. Sizing")]
        public SizingMode Sizing { get; set; }

        [NinjaScriptProperty]
        [Range(1, 100)]
        [Display(Name = "Contracts (fixed)", Description = "Position size when Sizing=FixedContracts. Ignored in RiskPercent mode.", Order = 2, GroupName = "3. Sizing")]
        public int Contracts { get; set; }

        [NinjaScriptProperty]
        [Range(0.05, 10.0)]
        [Display(Name = "Risk % of balance", Description = "Risked per trade when Sizing=RiskPercent. Ignored in FixedContracts mode.", Order = 3, GroupName = "3. Sizing")]
        public double RiskPercent { get; set; }

        [NinjaScriptProperty]
        [Range(1, 100)]
        [Display(Name = "Max contracts (cap)", Description = "Upper bound on RiskPercent-computed size.", Order = 4, GroupName = "3. Sizing")]
        public int MaxContracts { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 500.0)]
        [Display(Name = "Take profit (points)", Description = "TP distance when SlMode != POC. In POC mode, TP is computed from RR ratio × initial SL distance.", Order = 5, GroupName = "3. Sizing")]
        public double TpPoints { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Stop loss mode", Description = "OrOpposite = far side of OR. FixedPoints = fixed distance from entry. POC = session Point-of-Control ± offset.", Order = 6, GroupName = "3. Sizing")]
        public StopLossMode SlMode { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 500.0)]
        [Display(Name = "Stop loss fixed points", Description = "Used only when Stop loss mode = FixedPoints.", Order = 7, GroupName = "3. Sizing")]
        public double SlFixedPoints { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 200.0)]
        [Display(Name = "POC offset (points)", Description = "Distance below (long) or above (short) the POC where the SL sits. NQ-sensible: 5.", Order = 8, GroupName = "3. Sizing")]
        public double PocOffsetPoints { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 10.0)]
        [Display(Name = "R:R ratio", Description = "Used for POC mode: TP distance = SL distance × this ratio.", Order = 9, GroupName = "3. Sizing")]
        public double RRRatio { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  4. RISK
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Range(0, 100000)]
        [Display(Name = "Max daily loss ($)", Description = "Hard stop. Strategy halts for the rest of the day when realized daily P&L drops to -MaxDailyLoss. 0 = disabled.", Order = 1, GroupName = "4. Risk")]
        public double MaxDailyLoss { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Max trades per session", Description = "Entries allowed per session per day. Default 1 (one breakout).", Order = 2, GroupName = "4. Risk")]
        public int MaxTradesPerSession { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  5. FILTERS (the MT5 EA's edge — toggle each independently)
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Trend filter (H4 EMA)", Description = "Only allow breakouts aligned with the H4 EMA slope. Long requires close > EMA, short requires close < EMA.", Order = 1, GroupName = "5. Filters")]
        public bool TrendFilterEnabled { get; set; }

        [NinjaScriptProperty]
        [Range(5, 500)]
        [Display(Name = "Trend EMA period", Description = "Period of the H4 EMA used for trend alignment.", Order = 2, GroupName = "5. Filters")]
        public int TrendEMAPeriod { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "ADX filter (H1 regime)", Description = "Skip breakouts when the H1 market regime is ranging (ADX below threshold).", Order = 3, GroupName = "5. Filters")]
        public bool ADXFilterEnabled { get; set; }

        [NinjaScriptProperty]
        [Range(5, 100)]
        [Display(Name = "ADX period", Description = "Period of the H1 ADX.", Order = 4, GroupName = "5. Filters")]
        public int ADXPeriod { get; set; }

        [NinjaScriptProperty]
        [Range(10, 60)]
        [Display(Name = "ADX trend threshold", Description = "Entries allowed when H1 ADX ≥ this value (regime is trending).", Order = 5, GroupName = "5. Filters")]
        public int ADXTrendThreshold { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Candle quality filter", Description = "Require the breakout bar to have a strong body and a close near the breakout-direction extreme.", Order = 6, GroupName = "5. Filters")]
        public bool CandleQualityEnabled { get; set; }

        [NinjaScriptProperty]
        [Range(0.1, 1.0)]
        [Display(Name = "Min body ratio", Description = "|close-open| / (high-low) must be ≥ this to qualify. 0.50 = body must be at least half the range.", Order = 7, GroupName = "5. Filters")]
        public double MinBodyRatio { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 1.0)]
        [Display(Name = "Min close location", Description = "For long: (close-low)/range ≥ this. For short: (high-close)/range ≥ this. 0.70 = close must be in the top/bottom 30%.", Order = 8, GroupName = "5. Filters")]
        public double MinCloseLocation { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  6. EXIT MANAGEMENT
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Partial TP enabled", Description = "Close a percentage of the position at the partial-TP R level.", Order = 1, GroupName = "6. Exit Management")]
        public bool PartialTPEnabled { get; set; }

        [NinjaScriptProperty]
        [Range(10, 90)]
        [Display(Name = "Partial TP % of position", Description = "Fraction of the position to close at partial TP.", Order = 2, GroupName = "6. Exit Management")]
        public double PartialTPPercent { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 5.0)]
        [Display(Name = "Partial TP RR", Description = "Partial TP triggers when price moves this many R in favor. 1.0 = at 1R.", Order = 3, GroupName = "6. Exit Management")]
        public double PartialTPRR { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Move SL to BE after partial TP", Description = "After partial-TP fills, move SL to entry ± BE offset.", Order = 4, GroupName = "6. Exit Management")]
        public bool MoveSLtoBEEnabled { get; set; }

        [NinjaScriptProperty]
        [Range(0, 50)]
        [Display(Name = "BE offset (points)", Description = "Small profit buffer when moving SL to breakeven. NQ-sensible: 1.", Order = 5, GroupName = "6. Exit Management")]
        public double BEOffsetPoints { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "ATR trailing stop", Description = "After BE move, trail SL by ATR × multiplier. Only tightens — never loosens.", Order = 6, GroupName = "6. Exit Management")]
        public bool TrailingEnabled { get; set; }

        [NinjaScriptProperty]
        [Range(5, 100)]
        [Display(Name = "Trailing ATR period", Description = "Period for the ATR used by the trailing stop (primary bars).", Order = 7, GroupName = "6. Exit Management")]
        public int TrailingATRPeriod { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 10.0)]
        [Display(Name = "Trailing ATR multiplier", Description = "Trailing distance = ATR × this.", Order = 8, GroupName = "6. Exit Management")]
        public double TrailingATRMult { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  7. VISUALIZATION
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Draw OR box", Description = "Draw the OR high/low and shaded zone on the chart.", Order = 1, GroupName = "7. Visualization")]
        public bool DrawOrBox { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Draw POC line", Description = "Draw a horizontal line at the session POC on entry (only when SlMode=POC).", Order = 2, GroupName = "7. Visualization")]
        public bool DrawPocLine { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Draw entry markers", Description = "Draw up/down arrows at entry bars.", Order = 3, GroupName = "7. Visualization")]
        public bool DrawEntryMarkers { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  8. TELEGRAM
        // ════════════════════════════════════════════════════════════════════

        [NinjaScriptProperty]
        [Display(Name = "Telegram enabled", Description = "Send trade + filter-block notifications to Telegram. See README for BotFather setup.", Order = 1, GroupName = "8. Telegram")]
        public bool TelegramEnabled { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Telegram bot token", Description = "Bot token from @BotFather. Format: 123456789:ABC-DEF...", Order = 2, GroupName = "8. Telegram")]
        public string TelegramBotToken { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Telegram chat ID", Description = "Your chat ID (get from @userinfobot). Can be negative for group chats.", Order = 3, GroupName = "8. Telegram")]
        public string TelegramChatId { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Telegram verbose", Description = "OFF = entries/exits/halts only. ON = also filter blocks, OR establishes.", Order = 4, GroupName = "8. Telegram")]
        public bool TelegramVerbose { get; set; }

        // ════════════════════════════════════════════════════════════════════
        //  Session times (ET) — NQ-specific, fixed
        // ════════════════════════════════════════════════════════════════════

        private static readonly TimeSpan LondonOpen   = new TimeSpan(3, 0, 0);
        private static readonly TimeSpan LondonClose  = new TimeSpan(11, 30, 0);
        private static readonly TimeSpan NewYorkOpen  = new TimeSpan(9, 30, 0);
        private static readonly TimeSpan NewYorkClose = new TimeSpan(16, 0, 0);
        private const double               NQ_POINT_VALUE = 20.0;  // $20 per NQ point per contract
        private const int                  SERIES_M1 = 1;
        private const int                  SERIES_H1 = 2;
        private const int                  SERIES_H4 = 3;

        // ════════════════════════════════════════════════════════════════════
        //  Internal state
        // ════════════════════════════════════════════════════════════════════

        private TimeZoneInfo   etZone;
        private DateTime       lastDay = DateTime.MinValue;

        private bool           londonDone;
        private bool           newYorkDone;
        private int            londonTradeCount;
        private int            newYorkTradeCount;
        private bool           haltedForDay;

        // Per-session OR state
        private bool           londonOrEstablished;
        private double         londonOrHigh;
        private double         londonOrLow;
        private bool           newYorkOrEstablished;
        private double         newYorkOrHigh;
        private double         newYorkOrLow;
        private DateTime       londonOrStartEt;
        private DateTime       newYorkOrStartEt;

        // Current-position state (cleared when position goes flat)
        private SessionChoice? currentPositionSession;
        private string         currentEntryTag;
        private bool           currentIsLong;
        private double         currentEntryPrice;
        private double         currentStopPrice;
        private double         currentInitialRisk;   // in points (|entry - initialStop|) — the "R" for partial TP
        private bool           partialTpTaken;
        private bool           beMoved;
        private double         currentPocPrice;

        private MarketPosition lastPosition = MarketPosition.Flat;
        private double         dailyRealizedPnl;

        // Telegram HTTP client (shared, process-wide)
        private static HttpClient telegramClient;

        // ════════════════════════════════════════════════════════════════════
        //  Lifecycle
        // ════════════════════════════════════════════════════════════════════

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name                                      = "UnifiedOrbStrategy";
                Description                               = "NQ Opening Range Breakout with trend/ADX/candle-quality filters + POC stops + partial-TP/BE/trail. Ported from MT5 EA.";
                Calculate                                 = Calculate.OnBarClose;
                EntriesPerDirection                       = 1;
                EntryHandling                             = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy              = true;
                ExitOnSessionCloseSeconds                 = 30;
                IsFillLimitOnTouch                        = false;
                MaximumBarsLookBack                       = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution                       = OrderFillResolution.Standard;
                Slippage                                  = 0;
                StartBehavior                             = StartBehavior.WaitUntilFlat;
                TimeInForce                               = TimeInForce.Gtc;
                TraceOrders                               = false;
                RealtimeErrorHandling                     = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling                        = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade                       = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // 1. Identity
                ProfileName              = "Unified";

                // 2. Session
                SessionMode              = SessionChoice.NewYork;
                OpeningRangeMinutes      = 15;
                SessionExitBufferMinutes = 5;

                // 3. Sizing (NQ-appropriate defaults)
                Sizing                   = SizingMode.FixedContracts;
                Contracts                = 2;
                RiskPercent              = 1.0;
                MaxContracts             = 10;
                TpPoints                 = 15.0;
                SlMode                   = StopLossMode.OrOpposite;
                SlFixedPoints            = 10.0;
                PocOffsetPoints          = 5.0;     // NQ-sensible; EURUSD default was 50 pips
                RRRatio                  = 2.0;

                // 4. Risk
                MaxDailyLoss             = 1500.0;
                MaxTradesPerSession      = 1;

                // 5. Filters (default ON to match EA; toggle off for raw ORB)
                TrendFilterEnabled       = true;
                TrendEMAPeriod           = 50;
                ADXFilterEnabled         = true;
                ADXPeriod                = 14;
                ADXTrendThreshold        = 25;
                CandleQualityEnabled     = true;
                MinBodyRatio             = 0.50;
                MinCloseLocation         = 0.70;

                // 6. Exit management (default ON to match EA)
                PartialTPEnabled         = true;
                PartialTPPercent         = 50.0;
                PartialTPRR              = 1.0;
                MoveSLtoBEEnabled        = true;
                BEOffsetPoints           = 1.0;     // NQ-sensible; EURUSD default was 10 pips
                TrailingEnabled          = true;
                TrailingATRPeriod        = 14;
                TrailingATRMult          = 1.5;

                // 7. Visualization
                DrawOrBox                = true;
                DrawPocLine              = true;
                DrawEntryMarkers         = true;

                // 8. Telegram (opt-in)
                TelegramEnabled          = false;
                TelegramBotToken         = "";
                TelegramChatId           = "";
                TelegramVerbose          = false;
            }
            else if (State == State.Configure)
            {
                // Multi-timeframe data series for filters + POC
                AddDataSeries(BarsPeriodType.Minute, 1);    // [1] M1 for POC volume profile
                AddDataSeries(BarsPeriodType.Minute, 60);   // [2] H1 for ADX
                AddDataSeries(BarsPeriodType.Minute, 240);  // [3] H4 for trend EMA

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
                string filters = $"T={ToOnOff(TrendFilterEnabled)}/A={ToOnOff(ADXFilterEnabled)}/C={ToOnOff(CandleQualityEnabled)}";
                string exits   = $"PTP={ToOnOff(PartialTPEnabled)}/BE={ToOnOff(MoveSLtoBEEnabled)}/Trail={ToOnOff(TrailingEnabled)}";
                Print($"[{ProfileName}] ORB LIVE | Session={SessionMode} | OR={OpeningRangeMinutes}m | Sizing={Sizing} | SL={SlMode} | Filters=[{filters}] | Exits=[{exits}] | MaxLoss={MaxDailyLoss:C}");
                SendTelegram(false, $"🟢 *{EscapeMd(ProfileName)}* strategy LIVE\nSession: {SessionMode}\nFilters: {filters}\nExits: {exits}");
            }
            else if (State == State.Terminated)
            {
                SendTelegram(false, $"🔴 *{EscapeMd(ProfileName)}* strategy stopped.");
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  Main loop — fires for each series; only act on primary bar closes
        // ════════════════════════════════════════════════════════════════════

        protected override void OnBarUpdate()
        {
            // Only process on primary (1-min) bar closes. Secondary series still
            // need enough bars — check warmup for each filter's own series.
            if (BarsInProgress != 0) return;
            if (CurrentBar < BarsRequiredToTrade) return;

            DateTime etNow = ToEt(Time[0]);
            DateTime today = etNow.Date;

            // New trading day → reset daily state
            if (today != lastDay)
            {
                lastDay               = today;
                dailyRealizedPnl      = 0;
                haltedForDay          = false;
                londonDone            = false;
                newYorkDone           = false;
                londonTradeCount      = 0;
                newYorkTradeCount     = 0;
                londonOrEstablished   = false;
                newYorkOrEstablished  = false;
                Print($"[{ProfileName}] ── New trading day: {today:yyyy-MM-dd} ──");
            }

            // Manage an open position first (partial TP / BE / trailing) — runs
            // regardless of session windows so exits fire cleanly.
            if (Position.MarketPosition != MarketPosition.Flat)
                ManageOpenPosition();

            if (haltedForDay) return;

            // Process each enabled session independently (LDN and NY overlap 09:30–11:30).
            if (SessionMode == SessionChoice.London || SessionMode == SessionChoice.Both)
                ProcessSession(SessionChoice.London, etNow, today);
            if (SessionMode == SessionChoice.NewYork || SessionMode == SessionChoice.Both)
                ProcessSession(SessionChoice.NewYork, etNow, today);
        }

        /// <summary>
        /// Per-session logic: accumulate OR, run filter stack, fire breakout,
        /// flatten at session close. Called independently for each enabled
        /// session. Respects the single-position constraint.
        /// </summary>
        private void ProcessSession(SessionChoice sess, DateTime etNow, DateTime today)
        {
            bool done = sess == SessionChoice.London ? londonDone : newYorkDone;
            int  tradeCount = sess == SessionChoice.London ? londonTradeCount : newYorkTradeCount;
            if (done || tradeCount >= MaxTradesPerSession) return;

            TimeSpan openTod  = sess == SessionChoice.London ? LondonOpen  : NewYorkOpen;
            TimeSpan closeTod = sess == SessionChoice.London ? LondonClose : NewYorkClose;
            DateTime sessionOpen  = today + openTod;
            DateTime sessionClose = today + closeTod;
            DateTime orEnd        = sessionOpen.AddMinutes(OpeningRangeMinutes);
            DateTime flattenBy    = sessionClose.AddMinutes(-SessionExitBufferMinutes);

            // Out of this session's time window entirely
            if (etNow < sessionOpen || etNow >= sessionClose) return;

            // ── Opening range accumulation window ──
            if (etNow < orEnd)
            {
                bool established = sess == SessionChoice.London ? londonOrEstablished : newYorkOrEstablished;
                if (!established)
                {
                    if (sess == SessionChoice.London)
                    {
                        londonOrHigh = High[0];
                        londonOrLow  = Low[0];
                        londonOrStartEt = etNow;
                        londonOrEstablished = true;
                    }
                    else
                    {
                        newYorkOrHigh = High[0];
                        newYorkOrLow  = Low[0];
                        newYorkOrStartEt = etNow;
                        newYorkOrEstablished = true;
                    }
                    Print($"[{ProfileName}] {sess} OR started at {etNow:HH:mm} ET — opening H={High[0]:F2} L={Low[0]:F2}");
                    if (TelegramVerbose)
                        SendTelegram(false, $"📍 *{EscapeMd(ProfileName)}* {sess} OR start `{etNow:HH:mm} ET` — H=`{High[0]:F2}` L=`{Low[0]:F2}`");
                }
                else
                {
                    if (sess == SessionChoice.London)
                    {
                        if (High[0] > londonOrHigh) londonOrHigh = High[0];
                        if (Low[0]  < londonOrLow)  londonOrLow  = Low[0];
                    }
                    else
                    {
                        if (High[0] > newYorkOrHigh) newYorkOrHigh = High[0];
                        if (Low[0]  < newYorkOrLow)  newYorkOrLow  = Low[0];
                    }
                }
                return;
            }

            // OR window just closed → draw the box (once)
            DrawOrBoxForSession(sess, today);

            // Need an established OR to trade
            bool orEst = sess == SessionChoice.London ? londonOrEstablished : newYorkOrEstablished;
            if (!orEst) return;  // chart may have started mid-session

            double orH = sess == SessionChoice.London ? londonOrHigh : newYorkOrHigh;
            double orL = sess == SessionChoice.London ? londonOrLow  : newYorkOrLow;
            DateTime orStart = sess == SessionChoice.London ? londonOrStartEt : newYorkOrStartEt;

            // ── Breakout entry window ──
            if (etNow < flattenBy && Position.MarketPosition == MarketPosition.Flat)
            {
                bool longBreakout  = Close[0] > orH;
                bool shortBreakout = Close[0] < orL;
                if (!longBreakout && !shortBreakout) return;

                bool isLong = longBreakout;
                var (allowed, reason) = CheckEntryFilters(isLong);
                if (!allowed)
                {
                    Print($"[{ProfileName}] {sess} {(isLong ? "LONG" : "SHORT")} breakout REJECTED — {reason}");
                    if (TelegramVerbose)
                        SendTelegram(false, $"🚫 *{EscapeMd(ProfileName)}* {sess} {(isLong ? "LONG" : "SHORT")} rejected — {EscapeMd(reason)}");
                    // Mark the session done so we don't re-check every bar on the same breakout bar's repeats.
                    // (Next bar we'll re-check if price still satisfies breakout.)
                    return;
                }

                // Compute stop loss
                double stopPrice, pocPrice = 0;
                switch (SlMode)
                {
                    case StopLossMode.OrOpposite:
                        stopPrice = isLong ? orL : orH;
                        break;
                    case StopLossMode.FixedPoints:
                        stopPrice = isLong ? Close[0] - SlFixedPoints : Close[0] + SlFixedPoints;
                        break;
                    case StopLossMode.POC:
                    default:
                        pocPrice = CalculatePoc(orStart, etNow);
                        if (pocPrice <= 0)
                        {
                            Print($"[{ProfileName}] {sess} POC calculation failed — falling back to OrOpposite");
                            stopPrice = isLong ? orL : orH;
                        }
                        else
                        {
                            stopPrice = isLong ? pocPrice - PocOffsetPoints : pocPrice + PocOffsetPoints;
                            // Safety: if POC is on the wrong side of entry, fall back
                            if ((isLong && stopPrice >= Close[0]) || (!isLong && stopPrice <= Close[0]))
                            {
                                Print($"[{ProfileName}] {sess} POC={pocPrice:F2} on wrong side of entry — falling back to OrOpposite");
                                stopPrice = isLong ? orL : orH;
                                pocPrice = 0;
                            }
                        }
                        break;
                }

                // Safety: ensure stop is meaningful distance from entry (at least 1 point)
                double rawRisk = Math.Abs(Close[0] - stopPrice);
                if (rawRisk < 1.0)
                {
                    Print($"[{ProfileName}] {sess} SL too close ({rawRisk:F2}pt) — skipping entry");
                    return;
                }

                // Compute TP
                double tpPrice;
                if (SlMode == StopLossMode.POC)
                    tpPrice = isLong ? Close[0] + rawRisk * RRRatio : Close[0] - rawRisk * RRRatio;
                else
                    tpPrice = isLong ? Close[0] + TpPoints : Close[0] - TpPoints;

                // Position size
                int contracts = CalculatePositionSize(rawRisk);

                // Submit
                string tag = $"{sess}-{today:yyyyMMdd}-{(isLong ? "L" : "S")}";
                Print($"[{ProfileName}] {sess} {(isLong ? "LONG" : "SHORT")} breakout — entry~{Close[0]:F2}, SL@{stopPrice:F2} ({rawRisk:F2}pt), TP@{tpPrice:F2}, qty={contracts}" + (pocPrice > 0 ? $", POC={pocPrice:F2}" : ""));

                SetStopLoss(tag, CalculationMode.Price, stopPrice, false);
                SetProfitTarget(tag, CalculationMode.Price, tpPrice);

                if (isLong) EnterLong(contracts, tag);
                else        EnterShort(contracts, tag);

                // Record position state
                currentEntryTag        = tag;
                currentIsLong          = isLong;
                currentEntryPrice      = Close[0];
                currentStopPrice       = stopPrice;
                currentInitialRisk     = rawRisk;
                currentPocPrice        = pocPrice;
                partialTpTaken         = false;
                beMoved                = false;
                currentPositionSession = sess;

                // Session-level counters
                if (sess == SessionChoice.London) londonTradeCount++;
                else                              newYorkTradeCount++;
                if ((sess == SessionChoice.London ? londonTradeCount : newYorkTradeCount) >= MaxTradesPerSession)
                    MarkSessionDone(sess);

                // Visualization
                DrawEntryMarker(sess, today, isLong, Close[0]);
                if (pocPrice > 0) DrawPocLineForSession(sess, today, pocPrice);

                // Telegram
                SendTelegram(false, $"📈 *{EscapeMd(ProfileName)}* {sess} *{(isLong ? "LONG" : "SHORT")}*\n" +
                                    $"Entry `{Close[0]:F2}` · SL `{stopPrice:F2}` ({rawRisk:F2}pt) · TP `{tpPrice:F2}`\n" +
                                    $"Qty `{contracts}` · Risk `${rawRisk * NQ_POINT_VALUE * contracts:F0}`");
                return;
            }

            // ── End-of-session flatten ──
            if (etNow >= flattenBy && Position.MarketPosition != MarketPosition.Flat && currentPositionSession == sess)
            {
                Print($"[{ProfileName}] {sess} session-end flatten at {etNow:HH:mm} ET");
                ExitLong();
                ExitShort();
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  Filter stack (ported from ORB_Filters.mqh)
        // ════════════════════════════════════════════════════════════════════

        private (bool allowed, string reason) CheckEntryFilters(bool isLong)
        {
            // Trend alignment (H4 EMA)
            if (TrendFilterEnabled)
            {
                if (CurrentBars[SERIES_H4] < TrendEMAPeriod + 5)
                    return (false, $"H4 EMA warmup ({CurrentBars[SERIES_H4]}/{TrendEMAPeriod + 5})");
                double h4Ema;
                try { h4Ema = EMA(BarsArray[SERIES_H4], TrendEMAPeriod)[0]; }
                catch { return (false, "H4 EMA error"); }
                if (isLong && Close[0] <= h4Ema)
                    return (false, $"Against H4 trend (close {Close[0]:F2} ≤ EMA {h4Ema:F2})");
                if (!isLong && Close[0] >= h4Ema)
                    return (false, $"Against H4 trend (close {Close[0]:F2} ≥ EMA {h4Ema:F2})");
            }

            // ADX regime (H1)
            if (ADXFilterEnabled)
            {
                if (CurrentBars[SERIES_H1] < ADXPeriod + 5)
                    return (false, $"H1 ADX warmup ({CurrentBars[SERIES_H1]}/{ADXPeriod + 5})");
                double h1Adx;
                try { h1Adx = ADX(BarsArray[SERIES_H1], ADXPeriod)[0]; }
                catch { return (false, "H1 ADX error"); }
                if (h1Adx < ADXTrendThreshold)
                    return (false, $"H1 ADX {h1Adx:F1} < trend threshold {ADXTrendThreshold}");
            }

            // Candle quality (primary)
            if (CandleQualityEnabled)
            {
                double range = High[0] - Low[0];
                if (range <= 0) return (false, "Zero-range bar");
                double body = Math.Abs(Close[0] - Open[0]);
                double bodyRatio = body / range;
                if (bodyRatio < MinBodyRatio)
                    return (false, $"Body ratio {bodyRatio:P0} < min {MinBodyRatio:P0}");
                double closeLocLong  = (Close[0] - Low[0]) / range;
                double closeLocShort = (High[0] - Close[0]) / range;
                if (isLong && closeLocLong < MinCloseLocation)
                    return (false, $"Close in top {(1 - closeLocLong):P0} (want ≥ {MinCloseLocation:P0})");
                if (!isLong && closeLocShort < MinCloseLocation)
                    return (false, $"Close in bottom {(1 - closeLocShort):P0} (want ≥ {MinCloseLocation:P0})");
            }

            return (true, "");
        }

        // ════════════════════════════════════════════════════════════════════
        //  Volume profile POC (ported from ORB_VolumeProfile.mqh)
        // ════════════════════════════════════════════════════════════════════

        private double CalculatePoc(DateTime sessionStartEt, DateTime nowEt)
        {
            if (CurrentBars[SERIES_M1] < 5) return 0;

            var bins = new Dictionary<double, double>();
            double tickSize = Instrument?.MasterInstrument?.TickSize ?? 0.25;

            int endIdx = CurrentBars[SERIES_M1];
            for (int i = 0; i <= endIdx && i < 720; i++)  // cap: 12 hours of M1
            {
                DateTime btEt;
                try { btEt = ToEt(Times[SERIES_M1][i]); } catch { break; }

                if (btEt < sessionStartEt) break;      // walked past session start
                if (btEt > nowEt) continue;            // future (shouldn't occur at i≥0)

                double hi  = Highs[SERIES_M1][i];
                double lo  = Lows[SERIES_M1][i];
                double cl  = Closes[SERIES_M1][i];
                double typPrice = (hi + lo + cl) / 3.0;
                double binned = Math.Round(typPrice / tickSize) * tickSize;
                double vol = Volumes[SERIES_M1][i];

                if (bins.TryGetValue(binned, out double cur))
                    bins[binned] = cur + vol;
                else
                    bins[binned] = vol;
            }

            if (bins.Count == 0) return 0;

            double maxVol = 0, pocPrice = 0;
            foreach (var kv in bins)
            {
                if (kv.Value > maxVol) { maxVol = kv.Value; pocPrice = kv.Key; }
            }
            return pocPrice;
        }

        // ════════════════════════════════════════════════════════════════════
        //  Position sizing
        // ════════════════════════════════════════════════════════════════════

        private int CalculatePositionSize(double slPoints)
        {
            if (Sizing == SizingMode.FixedContracts) return Math.Max(1, Contracts);

            // RiskPercent: (balance × risk%) ÷ ($20 × slPoints)
            double balance = 50000.0;  // safe default
            try
            {
                if (Account != null)
                {
                    double v = Account.Get(AccountItem.CashValue, Currency.UsDollar);
                    if (v > 0) balance = v;
                }
            }
            catch { /* backtest / no account — use default */ }

            double riskDollars = balance * RiskPercent / 100.0;
            double riskPerContract = slPoints * NQ_POINT_VALUE;
            if (riskPerContract <= 0) return 1;

            int n = (int)Math.Floor(riskDollars / riskPerContract);
            return Math.Max(1, Math.Min(n, MaxContracts));
        }

        // ════════════════════════════════════════════════════════════════════
        //  Exit management (ported from ORB_Session.mqh partial TP + BE + trail)
        // ════════════════════════════════════════════════════════════════════

        private void ManageOpenPosition()
        {
            if (string.IsNullOrEmpty(currentEntryTag)) return;       // no tracked position
            if (currentInitialRisk <= 0) return;                      // guard

            double px = Close[0];
            bool isLong = currentIsLong;

            // ── Partial TP ──
            if (PartialTPEnabled && !partialTpTaken)
            {
                double partialLevel = isLong
                    ? currentEntryPrice + currentInitialRisk * PartialTPRR
                    : currentEntryPrice - currentInitialRisk * PartialTPRR;
                bool hit = isLong ? (High[0] >= partialLevel) : (Low[0] <= partialLevel);
                if (hit)
                {
                    int totalQty = Math.Abs(Position.Quantity);
                    int qty = (int)Math.Max(1, Math.Floor(totalQty * PartialTPPercent / 100.0));
                    if (qty >= totalQty) qty = totalQty - 1;  // leave at least 1 contract for the runner
                    if (qty >= 1)
                    {
                        string exitTag = $"{currentEntryTag}-PTP";
                        if (isLong) ExitLong(qty, exitTag, currentEntryTag);
                        else        ExitShort(qty, exitTag, currentEntryTag);
                        partialTpTaken = true;
                        Print($"[{ProfileName}] Partial TP @ {partialLevel:F2} — closing {qty}/{totalQty}");
                        SendTelegram(false, $"🎯 *{EscapeMd(ProfileName)}* partial TP — closed `{qty}/{totalQty}` @ `{partialLevel:F2}`");
                        // BE move is triggered in OnExecutionUpdate when the partial fill is confirmed.
                    }
                }
            }

            // ── ATR trailing stop (only after BE move locked profit) ──
            if (TrailingEnabled && partialTpTaken && beMoved)
            {
                if (CurrentBar < TrailingATRPeriod + 5) return;
                double atr;
                try { atr = ATR(TrailingATRPeriod)[0]; } catch { return; }
                if (atr <= 0) return;

                double trailDistance = atr * TrailingATRMult;
                double newStop = isLong ? px - trailDistance : px + trailDistance;

                // Only tighten (never loosen)
                bool tighter = isLong ? (newStop > currentStopPrice) : (newStop < currentStopPrice);
                // And respect the BE floor
                bool aboveBE = isLong
                    ? newStop >= currentEntryPrice + BEOffsetPoints - 0.001
                    : newStop <= currentEntryPrice - BEOffsetPoints + 0.001;

                if (tighter && aboveBE)
                {
                    SetStopLoss(currentEntryTag, CalculationMode.Price, newStop, false);
                    currentStopPrice = newStop;
                    // No Telegram per-trail (too noisy); Print only.
                    Print($"[{ProfileName}] Trailing SL → {newStop:F2} (ATR={atr:F2})");
                }
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  OnExecutionUpdate — detect partial TP fill → move SL to BE
        // ════════════════════════════════════════════════════════════════════

        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (execution?.Order == null) return;

            // Partial TP fill recognized by the "-PTP" suffix on the exit signal
            string exitName = execution.Order.Name;
            if (!string.IsNullOrEmpty(exitName) && exitName.EndsWith("-PTP") && partialTpTaken && !beMoved
                && Position.MarketPosition != MarketPosition.Flat
                && MoveSLtoBEEnabled
                && !string.IsNullOrEmpty(currentEntryTag))
            {
                double newStop = currentIsLong
                    ? currentEntryPrice + BEOffsetPoints
                    : currentEntryPrice - BEOffsetPoints;

                // Only move if it's actually tighter than current stop
                bool tighter = currentIsLong ? (newStop > currentStopPrice) : (newStop < currentStopPrice);
                if (tighter)
                {
                    SetStopLoss(currentEntryTag, CalculationMode.Price, newStop, false);
                    currentStopPrice = newStop;
                    Print($"[{ProfileName}] BE move: SL → {newStop:F2}");
                    SendTelegram(false, $"🔒 *{EscapeMd(ProfileName)}* SL → BE `{newStop:F2}`");
                }
                beMoved = true;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  Position & P&L tracking
        // ════════════════════════════════════════════════════════════════════

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            // When position goes flat, record the closed trade's P&L
            if (lastPosition != MarketPosition.Flat && marketPosition == MarketPosition.Flat)
            {
                var allTrades = SystemPerformance.AllTrades;
                if (allTrades != null && allTrades.Count > 0)
                {
                    var last = allTrades[allTrades.Count - 1];
                    dailyRealizedPnl += last.ProfitCurrency;

                    Print($"[{ProfileName}] Trade closed  |  P&L={last.ProfitCurrency:C}  |  daily total={dailyRealizedPnl:C}");
                    string emoji = last.ProfitCurrency >= 0 ? "✅" : "❌";
                    SendTelegram(false, $"{emoji} *{EscapeMd(ProfileName)}* trade closed — P&L `{last.ProfitCurrency:C}` · daily `{dailyRealizedPnl:C}`");

                    if (MaxDailyLoss > 0 && dailyRealizedPnl <= -MaxDailyLoss)
                    {
                        haltedForDay = true;
                        Print($"[{ProfileName}] !! HALTED FOR DAY !! — daily loss {dailyRealizedPnl:C} reached limit {-MaxDailyLoss:C}");
                        SendTelegram(false, $"⛔ *{EscapeMd(ProfileName)}* HALTED — daily loss `{dailyRealizedPnl:C}` hit limit `{-MaxDailyLoss:C}`");
                    }
                }

                // Clear position-level state
                currentPositionSession = null;
                currentEntryTag        = null;
                currentEntryPrice      = 0;
                currentStopPrice       = 0;
                currentInitialRisk     = 0;
                partialTpTaken         = false;
                beMoved                = false;
                currentPocPrice        = 0;
            }
            lastPosition = marketPosition;
        }

        // ════════════════════════════════════════════════════════════════════
        //  Chart drawing
        // ════════════════════════════════════════════════════════════════════

        private void DrawOrBoxForSession(SessionChoice sess, DateTime today)
        {
            if (!DrawOrBox) return;
            bool est = sess == SessionChoice.London ? londonOrEstablished : newYorkOrEstablished;
            if (!est) return;

            double orH = sess == SessionChoice.London ? londonOrHigh : newYorkOrHigh;
            double orL = sess == SessionChoice.London ? londonOrLow  : newYorkOrLow;

            string prefix = $"{ProfileName}-{sess}-{today:yyyyMMdd}";
            // Idempotent: Draw.* tags replace previous, so OK to call every bar after OR close.
            try
            {
                Brush lineBrush = sess == SessionChoice.London ? Brushes.SteelBlue : Brushes.DarkOrange;
                // Project lines ~240 bars into the future from the current bar
                Draw.Line(this, $"{prefix}-orHi", false, 0, orH, -240, orH, lineBrush, DashStyleHelper.Solid, 1);
                Draw.Line(this, $"{prefix}-orLo", false, 0, orL, -240, orL, lineBrush, DashStyleHelper.Solid, 1);
            }
            catch (Exception ex) { Print($"[{ProfileName}] Draw OR box error: {ex.Message}"); }
        }

        private void DrawPocLineForSession(SessionChoice sess, DateTime today, double pocPrice)
        {
            if (!DrawPocLine || pocPrice <= 0) return;
            string prefix = $"{ProfileName}-{sess}-{today:yyyyMMdd}";
            try
            {
                Draw.Line(this, $"{prefix}-poc", false, 0, pocPrice, -240, pocPrice, Brushes.Gold, DashStyleHelper.Dash, 2);
            }
            catch (Exception ex) { Print($"[{ProfileName}] Draw POC error: {ex.Message}"); }
        }

        private void DrawEntryMarker(SessionChoice sess, DateTime today, bool isLong, double price)
        {
            if (!DrawEntryMarkers) return;
            string prefix = $"{ProfileName}-{sess}-{today:yyyyMMdd}";
            try
            {
                if (isLong) Draw.ArrowUp  (this, $"{prefix}-entry", false, 0, price - 2, Brushes.LimeGreen);
                else        Draw.ArrowDown(this, $"{prefix}-entry", false, 0, price + 2, Brushes.Red);
            }
            catch (Exception ex) { Print($"[{ProfileName}] Draw entry error: {ex.Message}"); }
        }

        // ════════════════════════════════════════════════════════════════════
        //  Telegram (fire-and-forget; never blocks or throws into the bar loop)
        // ════════════════════════════════════════════════════════════════════

        private void SendTelegram(bool verboseOnly, string message)
        {
            if (!TelegramEnabled) return;
            if (verboseOnly && !TelegramVerbose) return;
            if (string.IsNullOrWhiteSpace(TelegramBotToken) || string.IsNullOrWhiteSpace(TelegramChatId)) return;

            try
            {
                if (telegramClient == null)
                    telegramClient = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };

                string url = $"https://api.telegram.org/bot{TelegramBotToken}/sendMessage";
                var form = new Dictionary<string, string>
                {
                    { "chat_id", TelegramChatId },
                    { "text", message },
                    { "parse_mode", "Markdown" },
                    { "disable_web_page_preview", "true" }
                };
                var content = new FormUrlEncodedContent(form);

                // Fire-and-forget — catches all network exceptions silently
                Task.Run(async () =>
                {
                    try { await telegramClient.PostAsync(url, content); }
                    catch (Exception ex) { Print($"[{ProfileName}] Telegram error: {ex.Message}"); }
                });
            }
            catch (Exception ex) { Print($"[{ProfileName}] Telegram setup failed: {ex.Message}"); }
        }

        // ════════════════════════════════════════════════════════════════════
        //  Helpers
        // ════════════════════════════════════════════════════════════════════

        private DateTime ToEt(DateTime localBarTime)
        {
            try
            {
                DateTime utc = TimeZoneInfo.ConvertTimeToUtc(localBarTime, TimeZoneInfo.Local);
                return TimeZoneInfo.ConvertTimeFromUtc(utc, etZone);
            }
            catch { return localBarTime; }
        }

        private void MarkSessionDone(SessionChoice sess)
        {
            if (sess == SessionChoice.London) londonDone  = true;
            else                              newYorkDone = true;
        }

        private static string ToOnOff(bool b) => b ? "on" : "off";

        /// <summary>Escape Markdown special chars so Telegram doesn't mis-render.</summary>
        private static string EscapeMd(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("_", "\\_").Replace("*", "\\*").Replace("[", "\\[").Replace("`", "\\`");
        }
    }
}
