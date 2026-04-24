// ═══════════════════════════════════════════════════════════════════════════
//  OrbEaV3 — Opening Range Breakout with quality filters, POC-anchored stops,
//            volume-profile Value Area, and 7 entry modes.
//
//  Port target: the MT5 ORB EA described in the spec. Designed for NQ on a
//  1–5 min primary chart, but parameterized for other futures.
//
//  Data series (added in State.Configure — always added so indices are stable):
//      [0] = Primary chart (whatever the user attached)
//      [1] = OR timeframe   (ORTimeframeMinutes, default 6)
//      [2] = M1             (volume profile input)
//      [3] = Trend TF       (TrendTimeframeMinutes, default 240 = H4)
//      [4] = ADX TF         (ADXTimeframeMinutes, default 60 = H1)
//
//  State machine:
//      NotInSession → BuildingRange → WaitingForBreakout →
//                                     WaitingForTrigger → InTrade → SessionDone
//
//  Universal entry rule: trigger evaluation happens on the CLOSE of an OR-TF
//  bar (or M1 for Market-mode immediate fire). Entry then fires on the OPEN
//  (IsFirstTickOfBar) of the NEXT primary-series bar. Never intrabar markets.
// ═══════════════════════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Windows.Media;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
using NinjaTrader.NinjaScript.Indicators;

namespace NinjaTrader.NinjaScript.Strategies
{
    public class OrbEaV3 : Strategy
    {
        #region Enums
        public enum EntryModeType
        {
            Market              = 0,
            PocRetest           = 1,
            OrEdgeRetest        = 2,
            ConfirmationCandle  = 3,
            Momentum            = 4,
            PullbackFib         = 5,
            FvgRetest           = 6
        }

        private enum StrategyPhase
        {
            NotInSession,
            BuildingRange,
            WaitingForBreakout,
            WaitingForTrigger,
            InTrade,
            SessionDone
        }

        private enum BreakDirection { None, Up, Down }
        #endregion

        #region Constants (series indices)
        // Kept in constants so all AddDataSeries/BarsInProgress references agree.
        private const int IDX_PRIMARY = 0;
        private const int IDX_OR      = 1;
        private const int IDX_M1      = 2;
        private const int IDX_TREND   = 3;
        private const int IDX_ADX     = 4;
        #endregion

        #region State variables
        // Session / day tracking
        private DateTime currentSessionDate = DateTime.MinValue;
        private DateTime sessionStartDt;
        private DateTime sessionEndDt;
        private int tradesThisSession = 0;

        // State machine
        private StrategyPhase phase = StrategyPhase.NotInSession;

        // Opening range build
        private int orBarsCollected = 0;
        private double orHigh = double.MinValue;
        private double orLow  = double.MaxValue;
        private bool   orReady = false;

        // Breakout capture
        private BreakDirection breakDir = BreakDirection.None;
        private DateTime breakoutBarTime;
        private double boO, boH, boL, boC; // breakout candle OHLC
        private int barsSinceBreakout = 0;

        // Previous OR bar (needed for FVG's C1)
        private double prevOrO, prevOrH, prevOrL, prevOrC;
        private bool   prevOrValid = false;

        // FVG detection state (MODE 6)
        private bool   fvgPhaseADone = false; // 3-candle pattern evaluated?
        private bool   fvgFound      = false;
        private double fvgTop, fvgBottom;

        // Trigger bookkeeping
        private bool pendingEntryLong  = false;
        private bool pendingEntryShort = false;

        // POC / VAH / VAL (computed on every M1 close during session)
        private double currentPoc = double.NaN;
        private double currentVah = double.NaN;
        private double currentVal = double.NaN;

        // Entry / SL / TP / Partial management
        private string activeEntrySignal = null;
        private double entryPrice   = 0.0;
        private double stopPrice    = 0.0;
        private double targetPrice  = 0.0;
        private double partialTpPrice = 0.0;
        private int    initialQty   = 0;
        private bool   partialDone  = false;
        private bool   beMoved      = false;
        private double bestTrailStop = double.NaN; // monotonic trailing watermark

        // Indicators (instantiated in State.DataLoaded)
        private EMA trendEma;
        private ADX adxInd;
        private ATR atrInd;

        // Chart-drawing tag prefix (stable across a session so Draw.* updates
        // in place rather than duplicating).
        private string TagPrefix() =>
            $"ORB3-{currentSessionDate:yyyyMMdd}-";
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region User Inputs
        // ─────────────────────────────────────────────────────────────────

        // 1. Session
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "NY Start Hour", Description = "Session start hour (ET, 24h)", Order = 1, GroupName = "1. Session")]
        public int NYStartHour { get; set; } = 9;

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "NY Start Minute", Description = "Session start minute", Order = 2, GroupName = "1. Session")]
        public int NYStartMinute { get; set; } = 30;

        [NinjaScriptProperty]
        [Range(30, 720)]
        [Display(Name = "Session Duration (min)", Description = "Length of the trading window from start", Order = 3, GroupName = "1. Session")]
        public int SessionDurationMin { get; set; } = 240;

        // 2. Opening Range
        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "OR Candles", Description = "Number of OR-timeframe bars that form the opening range", Order = 1, GroupName = "2. Opening Range")]
        public int ORCandles { get; set; } = 3;

        [NinjaScriptProperty]
        [Range(1, 60)]
        [Display(Name = "OR Timeframe (min)", Description = "Minute timeframe used to build the opening range", Order = 2, GroupName = "2. Opening Range")]
        public int ORTimeframeMinutes { get; set; } = 6;

        // 3. Entry & Breakout
        [NinjaScriptProperty]
        [Display(Name = "Entry Mode", Description = "Trigger mode for entries post-breakout", Order = 1, GroupName = "3. Entry & Breakout")]
        public EntryModeType EntryMode { get; set; } = EntryModeType.Market;

        [NinjaScriptProperty]
        [Range(0, 10000)]
        [Display(Name = "Min Break Distance (ticks)", Description = "Minimum ticks past OR edge to count as a breakout", Order = 2, GroupName = "3. Entry & Breakout")]
        public int MinBreakDistanceTicks { get; set; } = 800;

        [NinjaScriptProperty]
        [Range(1, 120)]
        [Display(Name = "Retest Timeout (bars)", Description = "OR-TF bars allowed between breakout and trigger before aborting", Order = 3, GroupName = "3. Entry & Breakout")]
        public int RetestTimeoutBars { get; set; } = 12;

        [NinjaScriptProperty]
        [Range(0.0, 100.0)]
        [Display(Name = "Pullback Percent", Description = "For MODE 5 PULLBACK_FIB: retracement into breakout body", Order = 4, GroupName = "3. Entry & Breakout")]
        public double PullbackPercent { get; set; } = 50.0;

        // 4. Risk
        [NinjaScriptProperty]
        [Range(0.01, 10.0)]
        [Display(Name = "Risk Percent", Description = "Percent of cash equity to risk per trade", Order = 1, GroupName = "4. Risk")]
        public double RiskPercent { get; set; } = 0.55;

        [NinjaScriptProperty]
        [Range(0.1, 10.0)]
        [Display(Name = "R:R Ratio", Description = "Target = slDistance × RRRatio", Order = 2, GroupName = "4. Risk")]
        public double RRRatio { get; set; } = 0.75;

        [NinjaScriptProperty]
        [Range(1, 2000)]
        [Display(Name = "POC Offset (ticks)", Description = "Legacy POC-anchored SL offset", Order = 3, GroupName = "4. Risk")]
        public int POCOffsetTicks { get; set; } = 150;

        // 5. Value Area SL (v3.1)
        [NinjaScriptProperty]
        [Display(Name = "Use Value Area SL", Description = "Anchor SL to VAH/VAL instead of POC", Order = 1, GroupName = "5. Value Area SL (v3.1)")]
        public bool UseValueAreaSL { get; set; } = false;

        [NinjaScriptProperty]
        [Range(1, 2000)]
        [Display(Name = "VA Offset (ticks)", Description = "Ticks beyond VAH (long) / VAL (short) for SL placement", Order = 2, GroupName = "5. Value Area SL (v3.1)")]
        public int VAOffsetTicks { get; set; } = 100;

        [NinjaScriptProperty]
        [Range(10.0, 99.0)]
        [Display(Name = "Value Area Percent", Description = "Volume % contained inside value area", Order = 3, GroupName = "5. Value Area SL (v3.1)")]
        public double ValueAreaPercent { get; set; } = 70.0;

        // 6. Partial TP & Trailing
        [NinjaScriptProperty]
        [Display(Name = "Partial TP Enabled", Description = "Enable partial take profit and BE move", Order = 1, GroupName = "6. Partial TP & Trailing")]
        public bool PartialTPEnabled { get; set; } = true;

        [NinjaScriptProperty]
        [Range(1.0, 99.0)]
        [Display(Name = "Partial TP Percent", Description = "Percent of quantity to close at partial TP", Order = 2, GroupName = "6. Partial TP & Trailing")]
        public double PartialTPPercent { get; set; } = 30.0;

        [NinjaScriptProperty]
        [Range(0.1, 5.0)]
        [Display(Name = "Partial TP R:R", Description = "Partial TP fires at this multiple of initial risk", Order = 3, GroupName = "6. Partial TP & Trailing")]
        public double PartialTPRR { get; set; } = 0.5;

        [NinjaScriptProperty]
        [Display(Name = "Move SL to BE", Description = "After partial TP, move stop to entry + BE offset", Order = 4, GroupName = "6. Partial TP & Trailing")]
        public bool MoveSLtoBE { get; set; } = true;

        [NinjaScriptProperty]
        [Range(0, 200)]
        [Display(Name = "BE Offset (ticks)", Description = "Breakeven offset on winning side", Order = 5, GroupName = "6. Partial TP & Trailing")]
        public int BEOffsetTicks { get; set; } = 10;

        [NinjaScriptProperty]
        [Display(Name = "Trailing Enabled", Description = "Enable ATR trailing stop after partial TP", Order = 6, GroupName = "6. Partial TP & Trailing")]
        public bool TrailingEnabled { get; set; } = false;

        [NinjaScriptProperty]
        [Range(2, 200)]
        [Display(Name = "Trailing ATR Period", Description = "ATR lookback for trailing stop", Order = 7, GroupName = "6. Partial TP & Trailing")]
        public int TrailingATRPeriod { get; set; } = 14;

        [NinjaScriptProperty]
        [Range(0.1, 10.0)]
        [Display(Name = "Trailing ATR Mult", Description = "Trail distance = ATR × this multiplier", Order = 8, GroupName = "6. Partial TP & Trailing")]
        public double TrailingATRMult { get; set; } = 2.5;

        // 7. Trend Filter
        [NinjaScriptProperty]
        [Display(Name = "Trend Filter Enabled", Description = "Enable higher-TF EMA trend filter", Order = 1, GroupName = "7. Trend Filter")]
        public bool TrendFilterEnabled { get; set; } = true;

        [NinjaScriptProperty]
        [Range(1, 240)]
        [Display(Name = "Trend Timeframe (min)", Description = "Timeframe for trend EMA", Order = 2, GroupName = "7. Trend Filter")]
        public int TrendTimeframeMinutes { get; set; } = 240;

        [NinjaScriptProperty]
        [Range(5, 500)]
        [Display(Name = "Trend EMA Period", Description = "EMA lookback for trend filter", Order = 3, GroupName = "7. Trend Filter")]
        public int TrendEMAPeriod { get; set; } = 50;

        // 8. ADX Filter
        [NinjaScriptProperty]
        [Display(Name = "ADX Filter Enabled", Description = "Enable ADX regime filter", Order = 1, GroupName = "8. ADX Filter")]
        public bool ADXFilterEnabled { get; set; } = false;

        [NinjaScriptProperty]
        [Range(1, 240)]
        [Display(Name = "ADX Timeframe (min)", Description = "Timeframe for ADX", Order = 2, GroupName = "8. ADX Filter")]
        public int ADXTimeframeMinutes { get; set; } = 60;

        [NinjaScriptProperty]
        [Range(2, 100)]
        [Display(Name = "ADX Period", Description = "ADX lookback", Order = 3, GroupName = "8. ADX Filter")]
        public int ADXPeriod { get; set; } = 14;

        [NinjaScriptProperty]
        [Range(10, 50)]
        [Display(Name = "ADX Trend Threshold", Description = "ADX must be ≥ this to call market trending", Order = 4, GroupName = "8. ADX Filter")]
        public int ADXTrendThreshold { get; set; } = 25;

        [NinjaScriptProperty]
        [Range(5, 40)]
        [Display(Name = "ADX Range Threshold", Description = "ADX ≤ this is definitively ranging (informational)", Order = 5, GroupName = "8. ADX Filter")]
        public int ADXRangeThreshold { get; set; } = 15;

        // 9. Candle Quality
        [NinjaScriptProperty]
        [Display(Name = "Candle Quality Enabled", Description = "Enable body-ratio + close-location filter", Order = 1, GroupName = "9. Candle Quality")]
        public bool CandleQualityEnabled { get; set; } = true;

        [NinjaScriptProperty]
        [Range(0.05, 1.0)]
        [Display(Name = "Min Body Ratio", Description = "Minimum body/range ratio on breakout candle", Order = 2, GroupName = "9. Candle Quality")]
        public double MinBodyRatio { get; set; } = 0.30;

        [NinjaScriptProperty]
        [Range(0.1, 1.0)]
        [Display(Name = "Min Close Location", Description = "Minimum close-in-range (top for long, bottom for short)", Order = 3, GroupName = "9. Candle Quality")]
        public double MinCloseLocation { get; set; } = 0.50;

        // 10. Volume Profile
        [NinjaScriptProperty]
        [Range(10, 500)]
        [Display(Name = "VP Resolution", Description = "Number of price bins in the session volume profile", Order = 1, GroupName = "10. Volume Profile")]
        public int VPResolution { get; set; } = 50;

        // 11. Trade Settings
        [NinjaScriptProperty]
        [Range(1, 20)]
        [Display(Name = "Max Trades Per Session", Description = "Maximum entries allowed per session", Order = 1, GroupName = "11. Trade Settings")]
        public int MaxTradesPerSession { get; set; } = 2;

        [NinjaScriptProperty]
        [Display(Name = "Draw Chart Lines", Description = "Render OR box, POC/VAH/VAL, entry arrow, SL/TP lines", Order = 2, GroupName = "11. Trade Settings")]
        public bool DrawChartLines { get; set; } = true;

        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region Lifecycle — OnStateChange
        // ─────────────────────────────────────────────────────────────────
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "ORB v3 — multi-mode breakout with quality filters, POC/VA anchoring, partial TP, ATR trail.";
                Name        = "OrbEaV3";

                Calculate                       = Calculate.OnEachTick;
                EntriesPerDirection             = 1;
                EntryHandling                   = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy    = true;
                ExitOnSessionCloseSeconds       = 30;
                IsFillLimitOnTouch              = false;
                MaximumBarsLookBack             = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution             = OrderFillResolution.Standard;
                Slippage                        = 0;
                StartBehavior                   = StartBehavior.WaitUntilFlat;
                TimeInForce                     = TimeInForce.Day;
                TraceOrders                     = false;
                RealtimeErrorHandling           = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling              = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade             = 20;
                IsInstantiatedOnEachOptimizationIteration = true;
            }
            else if (State == State.Configure)
            {
                // Always add all aux series so indices stay stable regardless of
                // which filters the user toggles. Small memory cost, big safety win.
                AddDataSeries(BarsPeriodType.Minute, ORTimeframeMinutes);
                AddDataSeries(BarsPeriodType.Minute, 1);
                AddDataSeries(BarsPeriodType.Minute, TrendTimeframeMinutes);
                AddDataSeries(BarsPeriodType.Minute, ADXTimeframeMinutes);
            }
            else if (State == State.DataLoaded)
            {
                trendEma = EMA(BarsArray[IDX_TREND], TrendEMAPeriod);
                adxInd   = ADX(BarsArray[IDX_ADX],   ADXPeriod);
                atrInd   = ATR(BarsArray[IDX_PRIMARY], TrailingATRPeriod);
            }
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region OnBarUpdate — dispatcher by BarsInProgress
        // ─────────────────────────────────────────────────────────────────
        protected override void OnBarUpdate()
        {
            // Guard: wait until every series has enough history to be useful.
            if (CurrentBars[IDX_PRIMARY] < BarsRequiredToTrade) return;
            if (CurrentBars[IDX_OR]      < 1) return;
            if (CurrentBars[IDX_M1]      < 1) return;

            // Day-boundary reset — check once per primary-bar update.
            if (BarsInProgress == IDX_PRIMARY)
            {
                var d = Time[0].Date;
                if (d != currentSessionDate)
                {
                    ResetForNewDay(d);
                }

                // Session-gate on the primary timeline (the only reliable clock).
                UpdateSessionGate();
            }

            // Dispatch by series.
            if (BarsInProgress == IDX_M1)
            {
                if (IsFirstTickOfBar) OnM1BarClose();
                return;
            }
            if (BarsInProgress == IDX_OR)
            {
                if (IsFirstTickOfBar) OnORBarClose();
                return;
            }
            if (BarsInProgress == IDX_TREND || BarsInProgress == IDX_ADX)
            {
                // No per-tick work on higher TFs — indicators pull values on demand.
                return;
            }

            // PRIMARY series — per-tick entry + in-trade management.
            if (BarsInProgress == IDX_PRIMARY)
            {
                // Entry: only on first tick of a new primary bar.
                if (IsFirstTickOfBar && (pendingEntryLong || pendingEntryShort))
                {
                    TrySubmitEntry();
                }

                // In-trade management runs every tick.
                ManageOpenPosition();
            }
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region State Machine — session gate + per-series handlers
        // ─────────────────────────────────────────────────────────────────

        private void ResetForNewDay(DateTime newDate)
        {
            currentSessionDate = newDate;
            sessionStartDt = new DateTime(newDate.Year, newDate.Month, newDate.Day,
                                          NYStartHour, NYStartMinute, 0);
            sessionEndDt   = sessionStartDt.AddMinutes(SessionDurationMin);

            phase              = StrategyPhase.NotInSession;
            orBarsCollected    = 0;
            orHigh             = double.MinValue;
            orLow              = double.MaxValue;
            orReady            = false;
            breakDir           = BreakDirection.None;
            barsSinceBreakout  = 0;
            prevOrValid        = false;
            fvgPhaseADone      = false;
            fvgFound           = false;
            pendingEntryLong   = false;
            pendingEntryShort  = false;
            tradesThisSession  = 0;
            currentPoc         = double.NaN;
            currentVah         = double.NaN;
            currentVal         = double.NaN;
            activeEntrySignal  = null;

            Print($"[{newDate:yyyy-MM-dd}] New day — state reset. Session window: {sessionStartDt:HH:mm} → {sessionEndDt:HH:mm}");
        }

        private void UpdateSessionGate()
        {
            var t = Time[0];

            // End of session while flat → SessionDone (position close is handled
            // by IsExitOnSessionCloseStrategy).
            if (t >= sessionEndDt && phase != StrategyPhase.SessionDone)
            {
                if (phase != StrategyPhase.InTrade)
                {
                    TransitionPhase(StrategyPhase.SessionDone, "session window closed");
                }
                return;
            }

            // Enter session.
            if (phase == StrategyPhase.NotInSession && t >= sessionStartDt && t < sessionEndDt)
            {
                TransitionPhase(StrategyPhase.BuildingRange, "entered session window");
            }
        }

        private void TransitionPhase(StrategyPhase next, string reason)
        {
            if (phase == next) return;
            Print($"[{Time[0]:yyyy-MM-dd HH:mm:ss}] Phase: {phase} → {next} ({reason})");
            phase = next;
        }

        // Called from OnBarUpdate when BarsInProgress == IDX_OR and IsFirstTickOfBar.
        // "IsFirstTickOfBar" on a secondary series = the PRIOR bar just closed; its
        // values live at High[1]/Low[1]/Close[1] on that series.
        private void OnORBarClose()
        {
            // The just-closed bar:
            double o = Opens[IDX_OR][1];
            double h = Highs[IDX_OR][1];
            double l = Lows[IDX_OR][1];
            double c = Closes[IDX_OR][1];
            DateTime tClosed = Times[IDX_OR][1];

            // Only care about bars that closed INSIDE session window.
            if (tClosed < sessionStartDt || tClosed >= sessionEndDt) return;

            // BUILD RANGE
            if (phase == StrategyPhase.BuildingRange)
            {
                if (h > orHigh) orHigh = h;
                if (l < orLow)  orLow  = l;
                orBarsCollected++;

                Print($"   OR bar {orBarsCollected}/{ORCandles} closed — H:{orHigh:F2} L:{orLow:F2}");

                if (orBarsCollected >= ORCandles)
                {
                    orReady = true;
                    TransitionPhase(StrategyPhase.WaitingForBreakout, "OR complete");
                    if (DrawChartLines) DrawOpeningRange();
                }
            }
            // WAITING FOR BREAKOUT
            else if (phase == StrategyPhase.WaitingForBreakout)
            {
                double minBreak = MinBreakDistanceTicks * TickSize;
                bool bullBreak = c > orHigh + minBreak;
                bool bearBreak = c < orLow  - minBreak;

                if (!bullBreak && !bearBreak)
                {
                    RememberOrBar(o, h, l, c);
                    return;
                }

                // Apply filters.
                if (!PassesFilters(bullBreak, c, h, l, o))
                {
                    RememberOrBar(o, h, l, c);
                    return;
                }

                // Capture breakout.
                breakDir        = bullBreak ? BreakDirection.Up : BreakDirection.Down;
                boO             = o; boH = h; boL = l; boC = c;
                breakoutBarTime = tClosed;
                barsSinceBreakout = 0;
                fvgPhaseADone   = false;
                fvgFound        = false;

                Print($"   BREAKOUT {breakDir} — close:{c:F2} clears OR " +
                      $"{(bullBreak ? "high" : "low")}:{(bullBreak ? orHigh : orLow):F2} by {(bullBreak ? c-orHigh : orLow-c):F2}");

                TransitionPhase(StrategyPhase.WaitingForTrigger, "breakout + filters OK");

                // Mode 0 (Market): trigger fires immediately on this same bar.
                if (EntryMode == EntryModeType.Market)
                {
                    if (breakDir == BreakDirection.Up)  pendingEntryLong  = true;
                    else                                pendingEntryShort = true;
                    Print($"   Trigger: MARKET mode — entry on next primary bar open");
                }

                RememberOrBar(o, h, l, c);
            }
            // WAITING FOR TRIGGER
            else if (phase == StrategyPhase.WaitingForTrigger)
            {
                barsSinceBreakout++;

                // Timeout — abort this trigger, OR stays, look for next breakout.
                if (barsSinceBreakout > RetestTimeoutBars)
                {
                    Print($"   Trigger timeout ({barsSinceBreakout} bars > {RetestTimeoutBars}) — reverting");
                    breakDir = BreakDirection.None;
                    TransitionPhase(StrategyPhase.WaitingForBreakout, "trigger timeout");
                    RememberOrBar(o, h, l, c);
                    return;
                }

                // Evaluate trigger on the just-closed bar.
                bool fire = EvaluateTrigger(o, h, l, c);
                if (fire)
                {
                    if (breakDir == BreakDirection.Up)  pendingEntryLong  = true;
                    else                                pendingEntryShort = true;
                    Print($"   Trigger: {EntryMode} fired on bar closed {tClosed:HH:mm:ss}");
                }

                RememberOrBar(o, h, l, c);
            }
        }

        private void RememberOrBar(double o, double h, double l, double c)
        {
            prevOrO = o; prevOrH = h; prevOrL = l; prevOrC = c;
            prevOrValid = true;
        }

        // Called from OnBarUpdate when BarsInProgress == IDX_M1 and IsFirstTickOfBar.
        private void OnM1BarClose()
        {
            // Only recompute during session window.
            DateTime tClosed = Times[IDX_M1][1];
            if (tClosed < sessionStartDt || tClosed >= sessionEndDt) return;

            RecomputeVolumeProfile();

            if (DrawChartLines && !double.IsNaN(currentPoc))
                DrawProfileLines();
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region Filters (trend / ADX / candle quality)
        // ─────────────────────────────────────────────────────────────────
        private bool PassesFilters(bool bullBreak, double c, double h, double l, double o)
        {
            // Trend filter — needs H4-class EMA ready.
            if (TrendFilterEnabled && CurrentBars[IDX_TREND] >= TrendEMAPeriod)
            {
                double ema = trendEma[0];
                if (bullBreak  && c <= ema) { Print($"   Filter: TREND rejects long (close {c:F2} ≤ EMA {ema:F2})"); return false; }
                if (!bullBreak && c >= ema) { Print($"   Filter: TREND rejects short (close {c:F2} ≥ EMA {ema:F2})"); return false; }
            }

            // ADX filter.
            if (ADXFilterEnabled && CurrentBars[IDX_ADX] >= ADXPeriod)
            {
                double adx = adxInd[0];
                if (adx < ADXTrendThreshold) { Print($"   Filter: ADX rejects (ADX {adx:F1} < {ADXTrendThreshold})"); return false; }
            }

            // Candle quality.
            if (CandleQualityEnabled)
            {
                double range = h - l;
                if (range <= 0) { Print("   Filter: CANDLE rejects (zero range)"); return false; }
                double body = Math.Abs(c - o);
                double bodyRatio = body / range;
                double closeLoc = bullBreak ? (c - l) / range : (h - c) / range;

                if (bodyRatio < MinBodyRatio)
                {
                    Print($"   Filter: CANDLE rejects (body ratio {bodyRatio:F2} < {MinBodyRatio:F2})");
                    return false;
                }
                if (closeLoc < MinCloseLocation)
                {
                    Print($"   Filter: CANDLE rejects (close location {closeLoc:F2} < {MinCloseLocation:F2})");
                    return false;
                }
            }

            return true;
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region Trigger Evaluation (MODES 1–6; MODE 0 handled inline above)
        // ─────────────────────────────────────────────────────────────────
        private bool EvaluateTrigger(double o, double h, double l, double c)
        {
            bool isUp = breakDir == BreakDirection.Up;

            switch (EntryMode)
            {
                case EntryModeType.Market:
                    // Fires on the breakout bar itself — handled above.
                    return false;

                case EntryModeType.PocRetest:
                    if (double.IsNaN(currentPoc)) return false;
                    return isUp ? (l <= currentPoc && c > currentPoc)
                                : (h >= currentPoc && c < currentPoc);

                case EntryModeType.OrEdgeRetest:
                    return isUp ? (l <= orHigh && c > orHigh)
                                : (h >= orLow  && c < orLow);

                case EntryModeType.ConfirmationCandle:
                    return isUp ? (c > boC && c > orHigh)
                                : (c < boC && c < orLow);

                case EntryModeType.Momentum:
                    return isUp ? (h > boH && c > boC)
                                : (l < boL && c < boC);

                case EntryModeType.PullbackFib:
                {
                    double body = boC - boO;
                    double fib  = boC - body * (PullbackPercent / 100.0);
                    return isUp ? (l <= fib && c > fib)
                                : (h >= fib && c < fib);
                }

                case EntryModeType.FvgRetest:
                    return EvaluateFvgTrigger(h, l, c);

                default:
                    return false;
            }
        }

        // Two-phase FVG detector.
        //   Phase A: the first post-breakout bar provides C3. The "prev OR bar"
        //   at breakout time was C1. The breakout bar itself is C2.
        //   Phase B: once FVG identified, watch retest pattern on subsequent bars.
        private bool EvaluateFvgTrigger(double h, double l, double c)
        {
            bool isUp = breakDir == BreakDirection.Up;

            if (!fvgPhaseADone)
            {
                // C3 = current closed bar; C2 = breakout bar (boH/boL/boC/boO);
                // C1 = prev OR bar before breakout.
                if (!prevOrValid) { fvgPhaseADone = true; return false; }

                if (isUp && prevOrH < l)
                {
                    fvgFound  = true;
                    fvgBottom = prevOrH;
                    fvgTop    = l;
                    Print($"   FVG bull detected — bottom:{fvgBottom:F2} top:{fvgTop:F2}");
                }
                else if (!isUp && prevOrL > h)
                {
                    fvgFound  = true;
                    fvgBottom = h;
                    fvgTop    = prevOrL;
                    Print($"   FVG bear detected — bottom:{fvgBottom:F2} top:{fvgTop:F2}");
                }
                else
                {
                    Print("   FVG not present after breakout — waiting for timeout");
                }
                fvgPhaseADone = true;
                return false; // Phase A bar never fires an entry itself
            }

            if (!fvgFound) return false;

            return isUp ? (l <= fvgTop    && c > fvgTop)
                        : (h >= fvgBottom && c < fvgBottom);
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region Entry Submission
        // ─────────────────────────────────────────────────────────────────
        private void TrySubmitEntry()
        {
            // Gate: must be flat, still in session, under trade cap.
            if (Position.MarketPosition != MarketPosition.Flat) { pendingEntryLong = pendingEntryShort = false; return; }
            if (tradesThisSession >= MaxTradesPerSession)       { pendingEntryLong = pendingEntryShort = false; return; }
            if (phase != StrategyPhase.WaitingForTrigger)       { pendingEntryLong = pendingEntryShort = false; return; }

            bool isLong = pendingEntryLong;
            pendingEntryLong  = false;
            pendingEntryShort = false;

            // Reference price — Open of current primary bar.
            double refPrice = Open[0];

            // Compute SL.
            double sl;
            if (UseValueAreaSL && !double.IsNaN(currentVah) && !double.IsNaN(currentVal))
            {
                sl = isLong ? currentVah + VAOffsetTicks * TickSize
                            : currentVal - VAOffsetTicks * TickSize;
            }
            else
            {
                if (double.IsNaN(currentPoc))
                {
                    Print("   ABORT: POC not available for SL anchor");
                    return;
                }
                sl = isLong ? currentPoc - POCOffsetTicks * TickSize
                            : currentPoc + POCOffsetTicks * TickSize;
            }

            // Sanity: SL must be on the correct side of entry.
            double slDist = isLong ? refPrice - sl : sl - refPrice;
            if (slDist <= 0)
            {
                Print($"   ABORT: bad SL distance ({slDist:F2}) — sl:{sl:F2} vs ref:{refPrice:F2}");
                return;
            }

            // Sizing.
            double cash = GetAccountCashValue();
            double risk = cash * RiskPercent / 100.0;
            double riskPerContract = slDist * Instrument.MasterInstrument.PointValue;
            int qty = riskPerContract > 0 ? (int)Math.Floor(risk / riskPerContract) : 1;
            qty = Math.Max(1, qty);

            // Submit.
            string signal = isLong ? "ORB3_LONG" : "ORB3_SHORT";
            if (isLong) EnterLong(qty, signal); else EnterShort(qty, signal);

            // Store state so SL/TP/partial can attach after OnExecutionUpdate.
            activeEntrySignal = signal;
            entryPrice   = refPrice;
            stopPrice    = Instrument.MasterInstrument.RoundToTickSize(sl);
            double tpOffset = slDist * RRRatio;
            targetPrice  = Instrument.MasterInstrument.RoundToTickSize(
                              isLong ? refPrice + tpOffset : refPrice - tpOffset);
            partialTpPrice = Instrument.MasterInstrument.RoundToTickSize(
                              isLong ? refPrice + slDist * PartialTPRR
                                     : refPrice - slDist * PartialTPRR);
            initialQty   = qty;
            partialDone  = false;
            beMoved      = false;
            bestTrailStop = double.NaN;

            // Resting stop + target at broker.
            SetStopLoss(signal, CalculationMode.Price, stopPrice, false);
            SetProfitTarget(signal, CalculationMode.Price, targetPrice);

            Print($"   ENTRY {signal} qty:{qty} @ {refPrice:F2}  SL:{stopPrice:F2}  TP:{targetPrice:F2}  PartialTP:{partialTpPrice:F2}  risk/contract:${riskPerContract:F0}");

            if (DrawChartLines) DrawEntryMarkers(isLong);
            TransitionPhase(StrategyPhase.InTrade, "entry submitted");
            tradesThisSession++;
        }

        // Wrapper so backtests don't crash when Account is simulation-backed.
        private double GetAccountCashValue()
        {
            try
            {
                if (Account != null)
                {
                    double cash = Account.Get(AccountItem.CashValue, Currency.UsDollar);
                    if (cash > 0) return cash;
                }
            } catch { /* fall through */ }

            // Fallback for Strategy Analyzer where Account may not be set.
            return 50000.0;
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region In-Trade Management (partial TP → BE → ATR trail)
        // ─────────────────────────────────────────────────────────────────
        private void ManageOpenPosition()
        {
            if (Position.MarketPosition == MarketPosition.Flat) return;
            if (activeEntrySignal == null) return;

            bool isLong = Position.MarketPosition == MarketPosition.Long;
            double px = Close[0]; // OnEachTick → most recent trade

            // 1) Partial TP
            if (PartialTPEnabled && !partialDone)
            {
                bool hit = isLong ? px >= partialTpPrice : px <= partialTpPrice;
                if (hit)
                {
                    int qtyToClose = Math.Max(1, (int)Math.Floor(initialQty * PartialTPPercent / 100.0));
                    qtyToClose = Math.Min(qtyToClose, Position.Quantity - 1); // leave at least 1
                    if (qtyToClose > 0)
                    {
                        if (isLong) ExitLong(qtyToClose, "ORB3_PARTIAL", activeEntrySignal);
                        else        ExitShort(qtyToClose, "ORB3_PARTIAL", activeEntrySignal);
                        partialDone = true;
                        Print($"   Partial TP: closed {qtyToClose}/{initialQty} @ ~{px:F2}");

                        // 2) Move SL to BE + offset
                        if (MoveSLtoBE)
                        {
                            double be = isLong ? entryPrice + BEOffsetTicks * TickSize
                                               : entryPrice - BEOffsetTicks * TickSize;
                            be = Instrument.MasterInstrument.RoundToTickSize(be);
                            stopPrice = be;
                            SetStopLoss(activeEntrySignal, CalculationMode.Price, stopPrice, false);
                            beMoved = true;
                            Print($"   SL → BE: {stopPrice:F2}");
                        }
                    }
                }
            }

            // 3) ATR trailing (only after partial) — recompute once per primary bar
            if (TrailingEnabled && partialDone && IsFirstTickOfBar && BarsInProgress == IDX_PRIMARY)
            {
                if (atrInd != null && CurrentBars[IDX_PRIMARY] >= TrailingATRPeriod)
                {
                    double atrVal = atrInd[0];
                    double trail  = isLong ? px - atrVal * TrailingATRMult
                                           : px + atrVal * TrailingATRMult;
                    trail = Instrument.MasterInstrument.RoundToTickSize(trail);

                    // Tighten only — never loosen.
                    if (double.IsNaN(bestTrailStop))
                    {
                        bestTrailStop = trail;
                    }
                    else
                    {
                        bestTrailStop = isLong ? Math.Max(bestTrailStop, trail)
                                               : Math.Min(bestTrailStop, trail);
                    }

                    // Additionally, never go below BE once BE set.
                    if (beMoved)
                    {
                        double beLimit = isLong ? entryPrice + BEOffsetTicks * TickSize
                                                : entryPrice - BEOffsetTicks * TickSize;
                        bestTrailStop = isLong ? Math.Max(bestTrailStop, beLimit)
                                               : Math.Min(bestTrailStop, beLimit);
                    }

                    if (Math.Abs(bestTrailStop - stopPrice) >= TickSize)
                    {
                        stopPrice = bestTrailStop;
                        SetStopLoss(activeEntrySignal, CalculationMode.Price, stopPrice, false);
                        Print($"   Trail: SL → {stopPrice:F2} (ATR {atrVal:F2} × {TrailingATRMult})");
                    }
                }
            }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (marketPosition == MarketPosition.Flat && activeEntrySignal != null)
            {
                Print($"   Position flat (trade #{tradesThisSession}/{MaxTradesPerSession})");
                activeEntrySignal = null;
                partialDone = false;
                beMoved     = false;
                bestTrailStop = double.NaN;

                // Next phase depends on session/cap state.
                bool capReached = tradesThisSession >= MaxTradesPerSession;
                bool sessionOpen = Time[0] < sessionEndDt;

                if (!sessionOpen || capReached)
                {
                    TransitionPhase(StrategyPhase.SessionDone, capReached ? "trade cap reached" : "session closed");
                }
                else
                {
                    // Re-arm for the next breakout on the same OR.
                    breakDir = BreakDirection.None;
                    barsSinceBreakout = 0;
                    fvgPhaseADone = false;
                    fvgFound = false;
                    TransitionPhase(StrategyPhase.WaitingForBreakout, "position closed, re-arming");
                }
            }
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region Volume Profile — POC + Value Area
        // ─────────────────────────────────────────────────────────────────
        // Reconstruct a session-to-now volume profile across M1 bars, bin the
        // tick volume, and derive POC + VAH + VAL. Called on every M1 close
        // during the session window.
        private void RecomputeVolumeProfile()
        {
            // Find the M1 indices that fall inside the session window.
            // CurrentBar on BarsArray[IDX_M1] = Closes[IDX_M1][0] is the latest CLOSED bar
            // only when we're called from IsFirstTickOfBar on M1 (just after close).
            int lastIdx = CurrentBars[IDX_M1] - 1;
            if (lastIdx < 1) return;

            // Walk back to find the first M1 bar at or after sessionStartDt.
            int startIdx = -1;
            for (int i = 0; i < CurrentBars[IDX_M1]; i++)
            {
                // BarsAgo indexing: 0 = newest. We want absolute indices so:
                int absIdx = CurrentBars[IDX_M1] - 1 - i;
                DateTime t = BarsArray[IDX_M1].GetTime(absIdx);
                if (t < sessionStartDt) break;
                startIdx = absIdx;
            }
            if (startIdx < 0) return;

            // Scan range across selected bars.
            double hi = double.MinValue, lo = double.MaxValue;
            for (int idx = startIdx; idx <= lastIdx; idx++)
            {
                double bh = BarsArray[IDX_M1].GetHigh(idx);
                double bl = BarsArray[IDX_M1].GetLow(idx);
                if (bh > hi) hi = bh;
                if (bl < lo) lo = bl;
            }
            if (hi <= lo) return;

            int N = Math.Max(10, VPResolution);
            double binW = (hi - lo) / N;
            if (binW <= 0) return;

            double[] bins = new double[N];
            double totalVolume = 0.0;

            for (int idx = startIdx; idx <= lastIdx; idx++)
            {
                double bh = BarsArray[IDX_M1].GetHigh(idx);
                double bl = BarsArray[IDX_M1].GetLow(idx);
                double bv = BarsArray[IDX_M1].GetVolume(idx);
                if (bv <= 0) continue;

                int lo_b = (int)Math.Floor((bl - lo) / binW);
                int hi_b = (int)Math.Floor((bh - lo) / binW);
                if (lo_b < 0) lo_b = 0;
                if (hi_b >= N) hi_b = N - 1;
                int span = Math.Max(1, hi_b - lo_b + 1);
                double per = bv / span;
                for (int k = lo_b; k <= hi_b; k++) bins[k] += per;
                totalVolume += bv;
            }

            if (totalVolume <= 0) return;

            // POC = bin with max volume.
            int pocIdx = 0;
            double pocVol = bins[0];
            for (int k = 1; k < N; k++)
                if (bins[k] > pocVol) { pocVol = bins[k]; pocIdx = k; }

            currentPoc = lo + (pocIdx + 0.5) * binW;

            // Value Area: expand outward from POC until volume ≥ VAP * total.
            double target = totalVolume * ValueAreaPercent / 100.0;
            double accum = bins[pocIdx];
            int up = pocIdx, dn = pocIdx;

            while (accum < target && (up < N - 1 || dn > 0))
            {
                double volUp = up < N - 1 ? bins[up + 1] : -1.0;
                double volDn = dn > 0     ? bins[dn - 1] : -1.0;
                if (volUp < 0 && volDn < 0) break;

                if (volUp >= volDn) { up++; accum += bins[up]; }
                else                { dn--; accum += bins[dn]; }
            }

            currentVah = lo + (up + 1) * binW; // upper edge of topmost bin
            currentVal = lo + dn * binW;       // lower edge of bottom-most bin
        }
        #endregion

        // ─────────────────────────────────────────────────────────────────
        #region Chart Drawing
        // ─────────────────────────────────────────────────────────────────
        // All tags include the session date so draws update in place (same tag
        // = replace, per NT8 Draw.* semantics) and reset cleanly per day.
        private void DrawOpeningRange()
        {
            string p = TagPrefix();
            DateTime start = sessionStartDt;
            DateTime end   = sessionEndDt;

            Draw.Line(this, p + "orHi", false, start, orHigh, end, orHigh,
                      Brushes.DodgerBlue, DashStyleHelper.Solid, 2);
            Draw.Line(this, p + "orLo", false, start, orLow,  end, orLow,
                      Brushes.OrangeRed,  DashStyleHelper.Solid, 2);

            Draw.Rectangle(this, p + "orBox", false, start, orLow, end, orHigh,
                           Brushes.Lavender, Brushes.Lavender, 30);

            Print($"   Drew OR H:{orHigh:F2} L:{orLow:F2}");
        }

        private void DrawProfileLines()
        {
            string p = TagPrefix();
            DateTime start = sessionStartDt;
            DateTime end   = sessionEndDt;

            Draw.Line(this, p + "poc", false, start, currentPoc, end, currentPoc,
                      Brushes.Gold, DashStyleHelper.Dash, 2);

            if (!double.IsNaN(currentVah))
                Draw.Line(this, p + "vah", false, start, currentVah, end, currentVah,
                          Brushes.Goldenrod, DashStyleHelper.Dot, 1);
            if (!double.IsNaN(currentVal))
                Draw.Line(this, p + "val", false, start, currentVal, end, currentVal,
                          Brushes.Goldenrod, DashStyleHelper.Dot, 1);
        }

        private void DrawEntryMarkers(bool isLong)
        {
            string p = TagPrefix() + $"e{tradesThisSession}-";
            if (isLong) Draw.ArrowUp  (this, p + "arrow", false, 0, Low[0]  - TickSize * 4, Brushes.Lime);
            else        Draw.ArrowDown(this, p + "arrow", false, 0, High[0] + TickSize * 4, Brushes.OrangeRed);

            Draw.Line(this, p + "sl", false, Time[0], stopPrice,   Time[0].AddMinutes(SessionDurationMin), stopPrice,   Brushes.Red,  DashStyleHelper.DashDot, 2);
            Draw.Line(this, p + "tp", false, Time[0], targetPrice, Time[0].AddMinutes(SessionDurationMin), targetPrice, Brushes.Lime, DashStyleHelper.DashDot, 2);
        }
        #endregion
    }
}
