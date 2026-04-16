# Unified ORB Strategy — NinjaScript

Opening Range Breakout strategy for **NQ** (Nasdaq-100 E-mini) futures, designed
to drive a **Tradesyncer master account** that fans out fills to multiple
prop-firm follower accounts.

The strategy itself is mode-agnostic — it only consumes parameters. The choice
between **Unified** deployment and **Per-group** deployment is a deployment
topology decision, not a code decision.

---

## 1. Install

1. In NinjaTrader 8, open **Tools → Import → NinjaScript Add-On…** — OR simply
   drop `UnifiedOrbStrategy.cs` into
   `Documents/NinjaTrader 8/bin/Custom/Strategies/`.
2. Open **New → NinjaScript Editor**, press **F5** (Compile All). You should see
   `UnifiedOrbStrategy` appear under **Strategies**. No compile errors.
3. Open a **1-minute NQ chart**, click **Strategies**, add
   `UnifiedOrbStrategy`, and fill in the parameters (see §3 & §4 below).

> **Timezone note.** The strategy operates in ET internally and converts
> NinjaTrader's `Time[0]` via your local system timezone → UTC → ET. If NT is
> configured for something other than your system's local zone, or you're on a
> VPS in a different region, verify session opens by running once on sim — the
> first log line of each session prints `"OR started at HH:mm ET"`.

---

## 2. Deployment modes

Both modes use the **same strategy file**. You just run different instances with
different parameter values and (for per-group) different Tradesyncer master
accounts.

### 🎯 Mode A — Unified (single-master)

> One strategy → one master account → Tradesyncer mirrors to all followers.

```
    NinjaTrader (local/VPS)
      │
      │  UnifiedOrbStrategy instance — ProfileName="Unified"
      │  running on 1-min NQ chart
      │
      ▼
    Master account  (e.g. a sim/paper-traded Tradovate account)
      │
      │  Tradesyncer cloud — low-latency mirror
      │
      ▼
    ALL follower accounts (every Apex, Lucid, TopStep account you own)
```

**Parameter source.** Open the React app → Account Tracker tab → the
**Trade Copier — Unified Daily Objective** card already computes the values you
need. Derive NinjaScript inputs from them:

| NinjaScript input      | Formula                                            |
|------------------------|----------------------------------------------------|
| `Contracts`            | card → Contracts                                   |
| `TpPoints`             | card → Daily Target ÷ Contracts ÷ 20 (NQ = $20/pt) |
| `SlFixedPoints`        | card → Max Loss ÷ Contracts ÷ 20                   |
| `MaxDailyLoss`         | card → Max Loss (absolute $, positive number)      |

Rule of thumb: use `SlMode = OrOpposite` unless the OR is wider than your
`SlFixedPoints` bound, in which case fall back to `FixedPoints`.

### 🎛 Mode B — Per-group (multi-master)

> One strategy instance per group → one master account per group → Tradesyncer
> routes each master's fills only to that group's followers.

Use this when different firm groups have incompatible rule sets that make the
Unified target too conservative — e.g. Apex's consistency rule forces a daily
cap that bottlenecks the whole fleet, while Lucid would happily take a bigger
target.

```
    NinjaTrader
      ├── UnifiedOrbStrategy instance — ProfileName="Apex-group"
      │      → masterAccount=APEX_MASTER  (Tradesyncer copies to Apex followers only)
      │
      ├── UnifiedOrbStrategy instance — ProfileName="Lucid-group"
      │      → masterAccount=LUCID_MASTER (Tradesyncer copies to Lucid followers only)
      │
      └── UnifiedOrbStrategy instance — ProfileName="TopStep-group"
             → masterAccount=TS_MASTER    (Tradesyncer copies to TopStep followers only)
```

Each instance takes its group-specific parameter values. The React app's
**Account Tracker group filter** (Apex / Lucid / TopStep / …) produces the
right values per group — same four-line derivation as above, just filtered.

---

## 3. Parameters reference

### 1. Identity
| Param | Default | Notes |
|---|---|---|
| `ProfileName` | `"Unified"` | Purely a log label. Use `"Apex-NY"`, `"Lucid-London"`, etc. in per-group mode. |

### 2. Session
| Param | Default | Notes |
|---|---|---|
| `SessionMode` | `NewYork` | `London` (03:00–11:30 ET), `NewYork` (09:30–16:00 ET), or `Both`. |
| `OpeningRangeMinutes` | `15` | Minutes after session open used to compute the OR high/low. |
| `SessionExitBufferMinutes` | `5` | Flatten any open position this many minutes before session close. |

### 3. Sizing
| Param | Default | Notes |
|---|---|---|
| `Contracts` | `2` | Position size per entry. Use the min across all accounts being copied to. |
| `TpPoints` | `15.0` | Take-profit distance in NQ points. Internally converted to ticks (×4). |
| `SlMode` | `OrOpposite` | `OrOpposite` = stop at far side of the OR (conservative). `FixedPoints` = stop at a fixed point distance from entry. |
| `SlFixedPoints` | `10.0` | Only used when `SlMode = FixedPoints`. |

### 4. Risk
| Param | Default | Notes |
|---|---|---|
| `MaxDailyLoss` | `500.0` | Absolute dollars. When daily realized P&L reaches `-MaxDailyLoss`, the strategy halts until the next trading day. `0` disables the hard stop (not recommended on prop firms). |

---

## 4. Strategy logic (at a glance)

```
for each new 1-min bar close:
    if before OR end of enabled session:
        accumulate session OR high / low
    elif after OR end, before session-close-buffer, and flat:
        if close > OR_high → EnterLong  + TP @ entry+TpPoints + SL @ OR_low or fixed
        if close < OR_low  → EnterShort + TP @ entry-TpPoints + SL @ OR_high or fixed
        (one entry per session; flag prevents re-entry)
    elif position open AND within buffer of session close:
        flatten

on each position close:
    accumulate realized P&L into daily running total
    if daily P&L ≤ -MaxDailyLoss:
        HALT FOR DAY (no further entries until next trading day)
```

Entries are market orders placed via `EnterLong` / `EnterShort`. Protective
stops/targets are attached via NinjaScript's `SetStopLoss` / `SetProfitTarget`
using `PerEntryExecution` handling, so they live/die with the specific entry
signal.

---

## 5. Testing

1. **Backtest** — Strategy Analyzer → pick `UnifiedOrbStrategy`, 1-min NQ, a
   few months of recent data. Verify OR ranges match visual inspection and
   that session-end flattens happen on time.
2. **Sim real-time** — Attach to a 1-min NQ chart, **Sim101** account,
   click **Enabled**. Let it run through at least one full London and one full
   NY session. Watch the output tab — every bar of the OR window prints an
   OR update.
3. **Paper-traded Tradovate master** — Connect NinjaTrader to a
   paper-traded Tradovate account, let Tradesyncer copy to sim/demo followers
   at the prop firms. Confirm fills arrive on all followers within ~1 second.
4. **Live** — Flip one follower at a time from sim to live. Never go live on
   all followers at once the first day.

---

## 6. Operational notes

- **One instance per chart.** Running two instances on the same chart causes
  colliding signal tags. If you need both London and NY, use `SessionMode = Both`
  instead of spinning up two instances.
- **Restart behavior.** `StartBehavior.WaitUntilFlat` means if the strategy is
  disabled/re-enabled mid-position, it waits until flat before accepting new
  signals. The halted-for-day flag is **in-memory** — restarting NinjaTrader
  resets it. If you want persistent halts, save state to disk (not implemented).
- **Connection drops.** `RealtimeErrorHandling.StopCancelClose` means on any
  rejected order or connection error the strategy stops and cancels working
  orders. You'll see it in the Strategies tab as disabled with an error; fix
  and re-enable manually.
- **ET vs CT / DST.** London open = 03:00 ET = 08:00 UTC = 09:00 CET (winter) /
  10:00 CEST (summer). The strategy always uses ET; don't mentally convert.
- **Prop-firm consistency rules.** These live outside the strategy. The React
  app's Account Tracker computes consistency-aware `maxDailyProfit` caps; make
  sure `TpPoints × Contracts × 20` doesn't exceed your tightest account's cap.

---

## 7. Quick checklist for a new deployment

```
[ ] Strategy file compiles in NT editor (F5)
[ ] 1-min NQ chart open, correct session template
[ ] Strategy attached with correct ProfileName
[ ] Contracts, TpPoints, SlFixedPoints match the React app's card
[ ] MaxDailyLoss set to a real number (not 0 on live)
[ ] Backtest run: sensible number of trades, no compile/runtime errors
[ ] Sim test: at least one full trading day with London+NY if applicable
[ ] Tradesyncer master account linked
[ ] Tradesyncer → follower routing confirmed (paper-trade once)
[ ] Prop-firm risk rules verified against strategy parameters
[ ] Going live — one follower at a time
```
