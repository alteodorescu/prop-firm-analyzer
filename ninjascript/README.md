# Unified ORB Strategy — NinjaScript

Opening Range Breakout strategy for **NQ** (Nasdaq-100 E-mini) futures with a
**full filter stack** (H4 trend / H1 ADX / candle quality), **POC-based stops**,
**partial-TP → break-even → ATR trail** exit management, and optional **Telegram
alerts** — ported from an MT5 Expert Advisor.

Designed to drive a **Tradesyncer master account** that fans out fills to
multiple prop-firm follower accounts, but usable on any NinjaTrader-compatible
broker (Tradovate, Rithmic, etc.).

> **Why filters?** A raw opening-range breakout on 1-min NQ has no edge at 1:1
> R:R (~45% win rate — see the `ns-output.txt` session log in the repo). The
> filter stack ported from the MT5 EA rejects ~60–80% of raw breakouts by
> checking trend alignment, regime, and bar conviction, aiming for ≥55% win
> rate at 2:1 R:R. Every filter can be toggled off to reproduce the raw ORB.

---

## Contents

1. [Install](#1-install)
2. [Deployment modes (Unified vs per-group)](#2-deployment-modes)
3. [Parameters reference](#3-parameters-reference)
4. [Filter stack (the edge)](#4-filter-stack)
5. [Exit management](#5-exit-management)
6. [Sizing modes](#6-sizing-modes)
7. [Telegram setup](#7-telegram-setup)
8. [Visualization](#8-visualization)
9. [NQ vs. forex parameter conversion](#9-nq-vs-forex-parameter-conversion)
10. [Testing checklist](#10-testing-checklist)
11. [Operational notes](#11-operational-notes)

---

## 1. Install

1. Drop `UnifiedOrbStrategy.cs` into
   `Documents/NinjaTrader 8/bin/Custom/Strategies/`.
2. Open **New → NinjaScript Editor**, press **F5** (Compile All). No errors.
3. Open a **1-minute NQ chart**, click **Strategies**, add `UnifiedOrbStrategy`.
4. Fill in the parameters (see §3 below — defaults are sensible).
5. Click **Enabled**.

> **Timezone.** The strategy operates in ET internally and converts
> NinjaTrader's `Time[0]` via your local system timezone → UTC → ET. First OR
> line of each session prints `"OR started at HH:mm ET"` — spot-check in Output.

---

## 2. Deployment modes

Both modes use the **same strategy file**. You just run different instances with
different parameter values and (for per-group) different Tradesyncer master
accounts.

### 🎯 Mode A — Unified (single-master)

```
    NinjaTrader
      │  UnifiedOrbStrategy instance — ProfileName="Unified"
      ▼
    Master account  (sim or paper-traded Tradovate)
      │  Tradesyncer cloud
      ▼
    ALL follower accounts (Apex, Lucid, TopStep, …)
```

Parameter source: **Trade Copier — Unified Daily Objective** card in the React
app (Account Tracker tab). Click **Show NinjaScript parameters** to copy the
exact values.

### 🎛 Mode B — Per-group (multi-master)

```
    NinjaTrader
      ├── UnifiedOrbStrategy — ProfileName="Apex-group"     → master=APEX_MASTER
      ├── UnifiedOrbStrategy — ProfileName="Lucid-group"    → master=LUCID_MASTER
      └── UnifiedOrbStrategy — ProfileName="TopStep-group"  → master=TS_MASTER
```

Use the React app's group filter in the Unified Objective card to produce
group-specific parameter values. Tradesyncer routes each master's fills only to
that group's followers.

---

## 3. Parameters reference

### 1. Identity

| Param | Default | Notes |
|---|---|---|
| `ProfileName` | `"Unified"` | Label used in log lines and Telegram messages. Use `"Apex-NY"`, `"Lucid-LDN"`, etc. in per-group mode. |

### 2. Session

| Param | Default | Notes |
|---|---|---|
| `Session` | `NewYork` | `London` (03:00–11:30 ET), `NewYork` (09:30–16:00 ET), or `Both`. |
| `OpeningRangeMinutes` | `15` | Minutes after session open used for OR high/low. |
| `SessionExitBufferMinutes` | `5` | Flatten N minutes before session close. |

### 3. Sizing

| Param | Default | Notes |
|---|---|---|
| `Sizing` | `FixedContracts` | `FixedContracts` = always `Contracts` below. `RiskPercent` = size per-trade from account balance + SL distance. |
| `Contracts (fixed)` | `2` | Used when `Sizing=FixedContracts`. Minimum across all copied accounts. |
| `Risk % of balance` | `1.0` | Used when `Sizing=RiskPercent`. |
| `Max contracts (cap)` | `10` | Upper bound on RiskPercent-computed size. |
| `Take profit (points)` | `15` | TP distance when `SlMode ≠ POC`. |
| `Stop loss mode` | `OrOpposite` | `OrOpposite` · `FixedPoints` · `POC`. |
| `Stop loss fixed points` | `10` | Used only when `SlMode=FixedPoints`. |
| `POC offset (points)` | `5` | SL distance below/above POC (NQ-sensible; EURUSD default was 50). |
| `R:R ratio` | `2.0` | Used for POC mode: TP distance = SL distance × this. |

### 4. Risk

| Param | Default | Notes |
|---|---|---|
| `Max daily loss ($)` | `1500` | Strategy halts for the day when realized P&L drops to `-MaxDailyLoss`. `0` disables. |
| `Max trades per session` | `1` | Default 1 = one breakout per session. Up to 10. |

### 5. Filters *(the EA's edge)*

| Param | Default | Notes |
|---|---|---|
| `Trend filter (H4 EMA)` | `true` | Long only when close > H4 EMA; short only when close < EMA. |
| `Trend EMA period` | `50` | H4 EMA lookback. |
| `ADX filter (H1 regime)` | `true` | Allow only when H1 ADX ≥ threshold (trending regime). |
| `ADX period` | `14` | H1 ADX lookback. |
| `ADX trend threshold` | `25` | `H1 ADX ≥ 25` = trending → allow. Below = range → reject. |
| `Candle quality filter` | `true` | Require strong body + close near breakout extreme on breakout bar. |
| `Min body ratio` | `0.50` | `|close-open| / (high-low) ≥ 50%`. |
| `Min close location` | `0.70` | For long: close must be in top 30% of range. For short: bottom 30%. |

### 6. Exit management

| Param | Default | Notes |
|---|---|---|
| `Partial TP enabled` | `true` | Close a fraction of the position at `PartialTPRR` × R. |
| `Partial TP % of position` | `50` | % of contracts closed at partial. |
| `Partial TP RR` | `1.0` | R level for partial TP. 1.0 = at 1R in favor. |
| `Move SL to BE after partial TP` | `true` | After partial fills, SL → entry ± `BE offset`. |
| `BE offset (points)` | `1` | Small profit lock (NQ-sensible; EURUSD default was 10). |
| `ATR trailing stop` | `true` | Trail SL by `ATR × multiplier` after BE lock. Only tightens. |
| `Trailing ATR period` | `14` | ATR lookback on primary (1-min) bars. |
| `Trailing ATR multiplier` | `1.5` | Trail distance = ATR × 1.5. |

### 7. Visualization

| Param | Default | Notes |
|---|---|---|
| `Draw OR box` | `true` | OR high/low lines on chart. |
| `Draw POC line` | `true` | Dashed gold line at session POC on entry (only in `SlMode=POC`). |
| `Draw entry markers` | `true` | Up/down arrows at entry bars. |

### 8. Telegram

| Param | Default | Notes |
|---|---|---|
| `Telegram enabled` | `false` | Opt-in. Requires bot token + chat ID. |
| `Telegram bot token` | `""` | From `@BotFather`. See §7 below. |
| `Telegram chat ID` | `""` | From `@userinfobot`. Negative for groups. |
| `Telegram verbose` | `false` | OFF = entries/exits/halts only. ON = also filter blocks, OR establishes. |

---

## 4. Filter stack

All three filters default **ON**. Toggle individually to A/B the contribution of
each. All OFF → behavior is a raw ORB (identical to the pre-port strategy).

### 4.1 Trend filter (H4 EMA)

Reads an EMA on a 240-minute (H4) secondary data series (`BarsInProgress=3`).
Long breakouts require `close > EMA`; shorts require `close < EMA`. Filters
counter-trend fake breakouts.

**Warmup**: needs `CurrentBars[3] ≥ TrendEMAPeriod + 5` — typically 11 H4 bars =
~44 hours of data. Chart should load ≥ 2 weeks of history.

### 4.2 ADX regime filter (H1)

Reads ADX on a 60-minute secondary data series (`BarsInProgress=2`). Only allows
entries when `ADX ≥ ADXTrendThreshold` — the market is trending. In range
regimes (ADX < threshold), breakouts typically fail; the filter rejects them.

**Tuning**: `25` is a good default. Lower = more entries (more chop). Higher =
fewer entries (wait for strong trends). Try `20 / 25 / 30` in backtest.

### 4.3 Candle quality filter

Pure bar math on the primary series — no secondary data needed. Two checks:

1. **Body ratio** — `|close - open| / (high - low) ≥ MinBodyRatio`. Rejects
   dojis and spinning tops that close near the middle of the range.
2. **Close location** —
   - For **long**: `(close - low) / (high - low) ≥ MinCloseLocation` (close in top 30%).
   - For **short**: `(high - close) / (high - low) ≥ MinCloseLocation` (close in bottom 30%).

Rejects weak breakouts that close far from the breakout extreme.

### Filter verbosity

Every rejection is printed with the reason:
```
[Unified] NewYork LONG breakout REJECTED — H1 ADX 18.4 < trend threshold 25
[Unified] NewYork SHORT breakout REJECTED — Close in bottom 32% (want ≥ 70%)
```

With `Telegram verbose=true`, rejections are also sent to Telegram as `🚫`
messages — useful for understanding which filter is doing what.

---

## 5. Exit management

Runs as a three-stage progression on every open position:

```
Entry  ──►  Partial TP hit @ 1R        ──►  SL moved to BE+offset  ──►  ATR trail on remainder
          (close PartialTPPercent %)         (lock small profit)         (only tightens)
```

All three stages are toggleable. Typical disable patterns:

- **Pure ORB**: turn all three OFF. Strategy exits only at fixed TP or SL.
- **No trail**: PartialTP + BE ON, Trail OFF. Runner exits at fixed TP or BE.
- **Trail from entry**: PartialTP OFF, BE OFF, Trail ON (will trail from entry
  every bar; aggressive).

### Partial TP level

Computed as `PartialTPRR × initial SL distance`. With `PartialTPRR = 1.0`,
partial fires at 1R (equal to risk).

### BE move

Triggered in `OnExecutionUpdate` when the partial-TP fill is confirmed. Stop
moves to `entry ± BEOffsetPoints`. Only applied if it's a tighter stop than
the current one.

### ATR trailing

Active only after BE has moved. Each bar, computes `newStop = close ± ATR(N) ×
multiplier`. Only updates SL if:
- It's tighter than the current stop, **AND**
- It's still at or past the BE level (never drop below BE).

---

## 6. Sizing modes

### `FixedContracts` (default — recommended for trade-copier use)

Strategy always submits exactly `Contracts` (the input value) per entry.
Deterministic — good when Tradesyncer needs to mirror exact quantities to
followers and you want predictable fan-out sizing.

### `RiskPercent`

```
contracts = floor((balance × RiskPercent / 100) / (slPoints × $20))
           clamped to [1, MaxContracts]
```

- `balance` = `Account.CashValue` (USD). In backtest, falls back to $50,000.
- `slPoints` = initial SL distance computed for this entry.

**Example**: $100,000 balance, 1.0% risk, 8-point SL  
→ risk = $1,000  
→ per-contract risk = 8 × $20 = $160  
→ contracts = floor(1000 / 160) = 6 contracts

Cap this at `MaxContracts` to avoid runaway sizing on tight stops.

---

## 7. Telegram setup

1. **Create a bot.** In Telegram, message `@BotFather` → `/newbot` → follow
   prompts → receive a token like `123456789:ABCdef-GhiJKLmnop...`.
2. **Get your chat ID.** Message `@userinfobot` → returns your numeric chat ID
   (positive for personal chats, negative for group chats).
3. **Test your bot.** Send the bot `/start` so it can DM you (bots can only
   message users who've DM'd them first).
4. **Configure the strategy.** Set `TelegramEnabled=true`, paste the token and
   chat ID. Start the strategy. You should receive a `🟢 <Profile> strategy
   LIVE` message within a few seconds.

### Events

| Level | Event | Example |
|---|---|---|
| Default | Strategy start/stop | `🟢 Unified strategy LIVE` |
| Default | Trade open | `📈 Unified NewYork LONG — Entry 25897.75 · SL 25845.75 · TP 26027.75` |
| Default | Partial TP | `🎯 Unified partial TP — closed 1/2 @ 25945.75` |
| Default | BE move | `🔒 Unified SL → BE 25898.75` |
| Default | Trade close | `✅ Unified trade closed — P&L $588 · daily $588` |
| Default | Daily halt | `⛔ Unified HALTED — daily loss -$1501 hit limit -$1500` |
| Verbose | OR established | `📍 Unified NewYork OR start 09:30 ET — H=25902.50 L=25891.75` |
| Verbose | Filter block | `🚫 Unified NewYork LONG rejected — H1 ADX 18 < threshold 25` |

### Failure handling

All Telegram calls are **fire-and-forget** — a failed HTTP request prints to the
Output window but never throws into the bar loop. Connection drops, bad tokens,
and chat-ID typos all fail silently so the strategy keeps trading.

---

## 8. Visualization

With `Draw OR box = true`:
- **OR high line** (steel-blue for LDN, dark-orange for NY) extending right from
  the OR close bar.
- **OR low line** matching color.

With `Draw POC line = true` and `SlMode = POC`:
- **Gold dashed horizontal line** at the session POC price, drawn when the
  entry fires.

With `Draw entry markers = true`:
- **Green ArrowUp** 2 points below entry for longs.
- **Red ArrowDown** 2 points above entry for shorts.

All drawings are tagged `{ProfileName}-{session}-{yyyyMMdd}-{artifact}` so
multiple strategy instances don't collide.

---

## 9. NQ vs. forex parameter conversion

The MT5 EA was tuned for forex (EURUSD-type). "Points" in forex MT5 are
0.00001 (fifth decimal). On NQ, "points" are index points ($20/contract per
point). Defaults have been **converted for NQ**:

| Param | Forex default (EURUSD) | NQ default | Rationale |
|---|---:|---:|---|
| POC offset | `50 pts` = 5 pips = ~$50 | `5 NQ pts` = $100 | Similar dollar magnitude of offset. |
| BE offset | `10 pts` = 1 pip = ~$10 | `1 NQ pt` = $20 | Minimal lock-in profit. |
| TP points | n/a (EA uses RR) | `15 NQ pts` | Consistent with simple ORB baseline. |
| Trailing ATR multiplier | `1.5` | `1.5` | Unchanged — ATR multiplier is dimensionless. |
| Risk % | `1.0` | `1.0` | Unchanged — percent. |
| MaxDailyLoss | `0` (disabled by default in EA) | `1500` | Prop-firm safety floor for NQ. |

---

## 10. Testing checklist

### Strategy Analyzer backtest (always first)

1. **Compile** (`F5` in NinjaScript Editor). No errors.
2. **Load 3–6 months** of NQ 1-min history in Data Series. **Load ≥ 2 weeks
   extra** to warm up the H4 EMA.
3. **Trading hours**: `CME US Index Futures ETH` (covers LDN + NY, not RTH
   which is NY-only).
4. **First run — sanity** (all filters OFF, all exits OFF, `SlMode=FixedPoints`
   with 15/15): should match the pre-port simple-ORB results (~1 trade/day).
5. **Second run — filters ON** (defaults as shipped): expect ~30–50% of trades
   from the sanity run, win rate ≥ 55%, profit factor ≥ 1.3.
6. **Third run — POC SL** (SlMode=POC, RRRatio=2.0): compare — does POC-based
   SL improve risk management vs OrOpposite?

### Display tabs for debugging

| Display | What to check |
|---|---|
| Summary ($) | Total trades, profit factor, max drawdown, win % |
| Trades | Individual round-trips |
| Executions | Every fill — verify entries are after OR end + filters passed |
| **Output** *(separate window: New → NinjaScript Output)* | **Filter rejection reasons, OR starts, trade closes** |

### Sim real-time

1. Attach to NQ 1-min chart, `Sim101` account, `Enabled`.
2. Wait for one complete NY session.
3. Verify: OR box drawn, filter log lines appear, no crashes, trade fired if
   filters passed.

### Live — one follower at a time

Never enable all prop-firm followers on day 1. Promote them from sim → live in
sequence, one per trading day.

---

## 11. Operational notes

- **Data warmup**: Strategy needs `max(20, TrendEMAPeriod + 5, ADXPeriod + 5)`
  bars of primary data, plus ≥ 11 H4 bars (~44 hours) and ≥ ADXPeriod+5 H1 bars
  (~19 hours). Load enough chart history.
- **Secondary series cost**: Adding M1 + H1 + H4 series multiplies historical
  data load. On a cold chart, first compile may take 30–60s for months of data.
- **POC computation cost**: Binning up to 720 M1 bars per session is O(n).
  Negligible in live; adds ~5–10ms per entry check in backtest. Fine.
- **`StartBehavior.WaitUntilFlat`**: Mid-position re-enables wait until flat
  before accepting new signals. Halted-for-day is in-memory — NT restart resets
  it.
- **Multiple instances**: Each strategy instance has its own state. Use
  distinct `ProfileName` values so logs and Telegram messages are
  distinguishable.
- **One Telegram HttpClient per process**: All strategy instances share one
  static `HttpClient`. Safe — it's designed to be shared.

---

## 12. What's not implemented (deferred from the MT5 port)

| Feature | MT5 source | Status |
|---|---|---|
| News filter (FOMC / NFP avoidance) | `ORB_News.mqh` | **Deferred** — MT5 Calendar API has no NT equivalent. Plan B: integrate ForexFactory CSV. For v1, manually disable strategy around scheduled events. |
| Per-symbol config overrides | `ORB_Inputs.mqh` per-symbol | Not needed — one strategy instance per NT chart, one set of params. |
| Magic-number trade filtering | `ORB_Trade.mqh` | Replaced by NT's per-instance isolation. |

## Quick checklist for a new deployment

```
[ ] UnifiedOrbStrategy.cs compiles with F5
[ ] 1-min NQ chart with CME ETH trading hours + ≥ 2 weeks history loaded
[ ] Strategy attached with correct ProfileName and parameters
[ ] Filters toggled to desired profile (all ON for ported-EA behavior)
[ ] MaxDailyLoss set (don't run on 0 in prod)
[ ] Backtest: sanity (all filters OFF) matches prior behavior
[ ] Backtest: with filters ON, win rate ≥ 55%, PF ≥ 1.3
[ ] Output window open during live run — watch filter reasons
[ ] Telegram tested end-to-end (if enabled)
[ ] Sim test: at least one full trading day
[ ] Tradesyncer master linked + follower routing confirmed
[ ] Going live: one follower at a time
```
