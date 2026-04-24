# OrbEaV3 — NinjaTrader 8 port of the MT5 ORB EA

Single-file NinjaScript strategy that ports an MT5 Opening Range Breakout EA
to NT8. 7 entry modes, quality filters (trend / ADX / candle), real-time
volume profile with POC + value area, partial TP + BE + ATR trailing.

- **File:** `OrbEaV3.cs`
- **Class:** `NinjaTrader.NinjaScript.Strategies.OrbEaV3`
- **Primary chart:** 1–5 min NQ recommended. Works on any futures instrument.
- **Tick mode:** `Calculate = Calculate.OnEachTick` (intrabar management).

## 1. Install

```
# macOS / Parallels path (Parallels shared with Windows NT8):
cp OrbEaV3.cs "$PARALLELS_WIN/Documents/NinjaTrader 8/bin/Custom/Strategies/"

# Native Windows:
Copy OrbEaV3.cs → Documents\NinjaTrader 8\bin\Custom\Strategies\
```

Then in NinjaTrader:

1. Open **NinjaScript Editor** (`New → NinjaScript Editor`, or F11 from a chart).
2. Navigate **Strategies → OrbEaV3**. The file should appear after copy.
3. Press **F5** to compile. Bottom pane must show `0 errors, 0 warnings`.
4. Close and reopen any chart you want to attach it to so the strategy
   appears in the dropdown.

## 2. Settings to review before first use

Defaults are sane for NQ on a 1–5 min chart, but **these three should
always be reviewed** before live / sim-trade attachment:

| Setting | Default | Review because… |
|---|---|---|
| **`RiskPercent`** | 0.55 | You own the account equity. 0.55% = $275 risk on a $50K account. Scale to your tolerance. |
| **`MaxTradesPerSession`** | 2 | If you're stacking (copier across N accounts), think about whether 2 entries per session is too many. |
| **`NYStartHour / NYStartMinute`** | 9 / 30 | Your NT data feed's clock must match the interpretation. Confirm with **Tools → Options → General → Show timestamps in** = ET (or configure accordingly). |

Secondary review list (safe to leave at default for first backtest):

| Setting | Default | Notes |
|---|---|---|
| `ORCandles` × `ORTimeframeMinutes` | 3 × 6m = 18m | Classic 9:30–9:48 ET range. |
| `MinBreakDistanceTicks` | 800 | NQ tick = 0.25 pts → 800 ticks = 200 pts. Aggressive — tune down (e.g. 40) if you want more signals. |
| `EntryMode` | `Market` | For first test. Switch to `OrEdgeRetest` or `ConfirmationCandle` for higher-quality (lower-frequency) entries. |
| `UseValueAreaSL` | false | Start with POC-offset SL; flip once you trust the profile. |
| `TrendFilterEnabled` | true (H4 EMA50) | Big trade-count reducer. Set false to isolate the OR logic in backtests. |
| `ADXFilterEnabled` | false | Extra selectivity on top of trend — enable for NQ-only testing later. |

## 3. Confirming it's running (Output window)

While the strategy is attached to a chart or running in Strategy Analyzer,
open **New → NinjaScript Output** (or click the Output tab on the bottom
of the Strategy Analyzer). You should see, per day:

```
[2026-04-21] New day — state reset. Session window: 09:30 → 13:30
[2026-04-21 09:30:00] Phase: NotInSession → BuildingRange (entered session window)
   OR bar 1/3 closed — H:18712.50 L:18698.25
   OR bar 2/3 closed — H:18718.75 L:18698.25
   OR bar 3/3 closed — H:18722.00 L:18698.25
[2026-04-21 09:48:00] Phase: BuildingRange → WaitingForBreakout (OR complete)
   Drew OR H:18722.00 L:18698.25
   BREAKOUT Up — close:18924.25 clears OR high:18722.00 by 2.25
[2026-04-21 10:12:00] Phase: WaitingForBreakout → WaitingForTrigger (breakout + filters OK)
   Trigger: MARKET mode — entry on next primary bar open
   ENTRY ORB3_LONG qty:3 @ 18926.00  SL:18875.50  TP:18963.75  PartialTP:18944.50  risk/contract:$1010
   Drew OR ...
```

**Red flags in the output:**

- `Filter: TREND rejects` / `ADX rejects` / `CANDLE rejects` — expected
  behavior; just filter hits. Only concerning if you see dozens per day
  with no entries — tune thresholds.
- `ABORT: bad SL distance` — POC/VA produced an SL on the wrong side of
  entry. Investigate `RiskPercent` and `POCOffsetTicks` — too-tight a
  setting can produce invalid SL placement at low POC distances.
- `ABORT: POC not available for SL anchor` — M1 series hasn't populated
  yet. Usually only on the first trade of the first day in Strategy
  Analyzer; auto-resolves after warm-up.
- No `BREAKOUT` log for a whole day → `MinBreakDistanceTicks` is too
  strict. Try 40 for NQ to start.

## 4. Backtesting in Strategy Analyzer

1. **New → Strategy Analyzer** from the main menu.
2. **Strategy:** OrbEaV3.
3. **Instrument:** `NQ 03-26` (or the continuous contract via **NQ 06** etc.).
4. **Data:** historical minute data must be loaded for the **lowest TF
   the strategy uses** — which is 1-min, always. Load at least 1 month.
5. **Bars type:** match your primary chart plan. For live use of 1-min
   primary, set analyzer to 1 min.
6. **From/To:** pick a contiguous range where you have M1 data.
7. **Commission:** attach your broker's commission schedule. NT's default
   is `$0` — misleading.
8. **Run.** Results tab shows trade list, equity curve, stats. The
   Output tab carries the same `[BREAKOUT / ENTRY / Partial / Trail]`
   logs as live.

### Optimization tips

If you want to grid-search:

- `MinBreakDistanceTicks`: {40, 100, 200, 400, 800}
- `EntryMode`: {Market, OrEdgeRetest, ConfirmationCandle, Momentum}
- `PartialTPRR`: {0.3, 0.5, 0.75, 1.0}
- `RRRatio`: {0.5, 0.75, 1.0, 1.5, 2.0}

Keep `TrendFilterEnabled=true` during optimization — it's the single
biggest noise-reducer. Turn ADX off first pass, add once you've located
parameter stability plateaus.

## 5. Known limitations (deliberately out of scope)

- **No news / economic-calendar avoidance.** If you trade FOMC, pause
  manually.
- **No Telegram / email alerts.** Print-to-output only.
- **No prop-firm scoring integration.** This strategy is execution-only;
  pair with the tracker app for compliance / payout visibility.
- **`StartBehavior.WaitUntilFlat`** — attaching mid-position won't
  recover an existing trade. Flatten before attach.

## 6. File layout inside the `.cs`

Regions in order:
1. Enums (`EntryModeType`, `StrategyPhase`, `BreakDirection`)
2. Series-index constants
3. State variables
4. User inputs (11 groups via `[Display(GroupName="…")]`)
5. Lifecycle (`OnStateChange`)
6. `OnBarUpdate` dispatcher
7. State machine + filters
8. Trigger evaluation (modes 1–6; mode 0 is inline on breakout detection)
9. Entry submission + sizing
10. In-trade management (partial → BE → ATR trail) + `OnPositionUpdate`
11. Volume profile (POC + value area)
12. Chart drawing

~950 lines total, single file, no external dependencies beyond the NT8
indicators (EMA, ADX, ATR) already shipped with the platform.
