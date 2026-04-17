# Session State — Handoff Document

**Last updated:** 2026-04-17 (after running Monte Carlo on 3-year baseline, starting filter optimization)

This doc is for picking up the work across sessions when context fills up. Read this first in a new session before doing anything.

---

## Where we are right now

### The single sentence summary
We're tuning the `UnifiedOrbStrategy.cs` NinjaScript for **prop-firm challenge passing** (not long-term profitability). Currently running a 48-run optimization over `Trend EMA period` + `ADX trend threshold` to find settings that let enough trades through without destroying win rate. Monte Carlo on the prior baseline shows **42% challenge pass rate per attempt**, which is positive EV given bounded eval-fee downside.

### Currently in flight
The user is running a grid optimization in NinjaTrader Strategy Analyzer:

| Param | Range | Step | # |
|---|---:|---:|---:|
| `Trend EMA period` | 10 → 80 | 10 | 8 |
| `ADX trend threshold` | 15 → 30 | 3 | 6 |

**Total: 48 runs, ~10 min**. Fitness metric: Sortino Ratio.

When results come back, next step is picking the robust cluster (not the single max), locking those values, then moving to exit-management tuning in the next round.

### Explicit user framing
User is **NOT** trying to build a long-term profitable strategy. Goal: pass **one** prop firm challenge, get one payout, and if the account busts after that, fine. This is an asymmetric arbitrage on the prop firm eval-fee model, not a trading career. **This reframe is critical** — it changes the optimization target from long-run Sortino to short-run pass probability.

---

## Project layout

```
/Users/alteodorescu/Daytrading AI/prop-firm-analyzer/
├── src/App.jsx                       React app (4000+ lines, recently UI-redesigned)
├── src/ui.jsx                        Shared UI primitives (Button, Card, Badge, etc.)
├── src/useSupabaseData.js            Data hook
├── ninjascript/
│   ├── UnifiedOrbStrategy.cs         ~760-line NinjaScript (ported from MT5 EA)
│   └── README.md                     Setup + params reference
├── docs/
│   ├── ai-briefing-plan.md           ⚠ DEFERRED: Future Layer-1 AI integration plan
│   └── session-state.md              ← this file
├── supabase/                         DB schema
├── opt-results.csv                   3-year backtest day-by-day breakdown (497 trading days)
├── NQ_for_nt.csv                     3-year NQ 1-min converted from FirstrateData
└── tailwind.config.js / index.html / package.json  (standard Vite + Tailwind setup)
```

Local NQ_FOR_NT instrument in NinjaTrader: 3 years of 1-min data, backtest-ready. Point value = $20 (NQ), tick = 0.25. Merge policy irrelevant because we bypassed NT's merge.

---

## What we've done in this session (chronological)

1. **UI redesign of the whole React app** — completed across 9 phases. Modern SaaS dashboard, slate palette, dark mode via Tailwind `dark:` classes, new `src/ui.jsx` primitive library. Committed as `bb44570`.
2. **Cleanup pass** — deleted orphaned `src/Auth.jsx`, gitignored stray files. Committed as `188f06e`.
3. **NinjaScript ORB strategy v1** — built, compiled in NT8 8.1.6.3, backtested. Fixed a session-overlap bug where NY session's OR never accumulated because LDN time window ate it. Committed as `fd0b829`.
4. **MT5 EA port** — user supplied an MT5 EA zip (ORB with filter stack). Extracted, read, ported the filter/exit logic into the existing NinjaScript. Added Trend (H4 EMA), ADX (H1), Candle Quality filters. Added POC stops, partial TP, BE move, ATR trail. Added Telegram and chart drawing. Committed as `d2a25fc`.
5. **Data struggle** — NT8's merge policy doesn't propagate to secondary data series (H1/H4 via `AddDataSeries`). Primary data for `NQ 06-26` also only goes back ~3 weeks. User downloaded 12 NQ quarterly contracts, merge still didn't work properly.
6. **External data import** — bought/downloaded FirstrateData-format NQ 1-min continuous, wrote Python converter (`History.py` in repo root), imported as `NQ_FOR_NT`. First time the 3-year backtest actually ran over the full period.
7. **Point-value bug** — imported instrument defaulted to Stock type with $1 point value. User changed to Future with $20 point value. Numbers then scaled correctly.
8. **3-year baseline** — PF 0.85, 66% WR, 561 trades, -$22k net. Edge exists (high WR) but exits leak (W/L ratio 0.44 too low).
9. **300-run exit-tuning optimization** — showed gross loss is IDENTICAL across all 300 runs ($242,480). Exit params only affect winner magnitude, can't fix negative expectancy. Best Sortino-ranked runs all PF 0.91 (still losing).
10. **Monte Carlo on baseline** — 20k simulations starting random days in the 3-year dataset, target +$3k, bust -$2k trailing. Baseline gives **42% pass rate**. This is the key finding that validated the "challenge arbitrage" framing.
11. **User reframed** — doesn't care about long-run profit; wants to pass challenges. Doesn't want SL (accepts bust = lost eval fee). Wants $800/day target baked in.
12. **Current: 48-run filter optimization** (in flight as of right now).
13. **AI briefing plan saved** — see `docs/ai-briefing-plan.md`. Deferred until after current optimization completes.

---

## Key files and where to look

- **Strategy code**: `ninjascript/UnifiedOrbStrategy.cs`. Has 8 parameter groups (Identity, Session, Sizing, Risk, Filters, Exit Management, Visualization, Telegram). Ported MT5 EA logic with multi-TF data series via `AddDataSeries`.
- **AI Briefing future plan**: `docs/ai-briefing-plan.md`. Full design for Layer-1 daily AI-brief integration. 6 phases, ~15h. Deferred.
- **Backtest CSVs**:
  - `opt-results.csv`: baseline 3-year per-day P&L (497 days). Used for Monte Carlo.
  - `NQ_for_nt.csv`: source data (800k+ 1-min bars, 2023-2026).
- **Monte Carlo sim script**: was at `/tmp/prop_sim.py` (probably gone after reboot). Can regenerate from `opt-results.csv`.
- **Plan file (meta)**: `/Users/alteodorescu/.claude/plans/majestic-squishing-storm.md` — contains the MT5 EA port plan (completed).

---

## Critical context / gotchas

### NinjaScript strategy specifics
- **Primary timeframe**: NQ 1-min
- **Secondary data series** added via `AddDataSeries`:
  - `[1]` Minute 1 — for POC volume profile
  - `[2]` Minute 60 — for H1 ADX filter
  - `[3]` Minute 240 — for H4 EMA trend filter
- **Session overlap**: LDN (03:00–11:30 ET) and NY (09:30–16:00 ET) OVERLAP 09:30–11:30. Strategy tracks each session's OR independently because of this. Don't break this.
- **POC calculation**: iterates `BarsArray[1]` (M1) for session volume profile. Caps at 720 bars (12h).
- **Timezone conversion**: `ToEt()` converts chart-local to ET via UTC. User's NT VM is set to Eastern time so this is effectively no-op.
- **Telegram**: Fire-and-forget via `Task.Run(HttpClient.PostAsync)`. Never blocks bar loop. Silent-fails on network error.

### Data gotchas
- **NT8's merge policy does NOT propagate to secondary data series.** If you need 3-year H4 EMA, you CANNOT rely on `AddDataSeries` to merge — it loads only the specific contract's native data. Workaround was external CSV import, which is what we did.
- **Custom imported instruments default to Stock type** with $1 point value. Must manually change Instrument type to Future and set Point value = 20 for NQ, tick = 0.25.
- **FirstrateData ships in US/Eastern time.** NT interprets imported timestamps as system-local time. User's VM is in Eastern time so no conversion needed. If this changes (e.g., user moves VM to Europe/Bucharest), timestamps in the CSV must be converted before import.

### Monte Carlo pass-rate interpretation
At 42% per attempt:
- 1 attempt: 42% pass
- 2 attempts: 66%
- 3 attempts: 80%
- Expected attempts to first payout: 1/0.42 = 2.38
- Expected eval fees before payout: 2.38 × $200 = $476
- Net EV positive for any payout > $476

### Challenge-mode config (where we're headed)
Before this optimization, user was running:
```
Session = NewYork (or Both)
Contracts = 1 (previously 2 — halved for $1k daily limit fit)
TP = 15-40 pts (experimenting)
SL mode = FixedPoints (user is moving toward SL=500pt "effectively none")
  OR OrOpposite/POC (original config)
Max daily loss = $1000 (firm's breach limit)
Max trades per session = 1
Filters = all ON
Exits = all ON (partial 50% @ 1R, BE+1pt, ATR × 1.5)
```

### Committed but not deployed
- `188f06e` — last merged commit. Cleanup pass.
- `d2a25fc` — MT5 EA port with full filter stack.
- `fd0b829` — session-overlap fix.
- All in `main` branch, pushed to `https://github.com/alteodorescu/prop-firm-analyzer`.

---

## What to do next (priority order)

1. **Wait for the 48-run filter optimization to finish.** Should be ~10 min.
2. **User pastes / screenshots top-30 results sorted by Sortino.** Analyze parameter clustering (NOT the single max). Pick robust median of the cluster for `Trend EMA period` and `ADX trend threshold`.
3. **Lock those values as fixed inputs**, then run a second optimization over exits (`Partial TP RR`, `BE offset`, `Trailing ATR multiplier`) to see if they meaningfully change behavior now that filters are tuned.
4. **Re-run Monte Carlo** with the new baseline to compare pass rate vs 42%.
5. **If pass rate ≥ 50%: ship it** — user deploys to first prop firm eval via Tradesyncer.
6. **After live challenge results**: return to `docs/ai-briefing-plan.md` and implement Layer 1 (6 phases, ~15h).

---

## Open questions to confirm with user before resuming

1. What's the target prop firm for the first live challenge (Apex / TopStep / Lucid)? Affects consistency rule checks.
2. Anthropic API key and Telegram bot for AI briefing — reuse or provision new?
3. For the next round of optimization: do we also want to vary session mode (NY-only vs Both)? Right now we keep session fixed.

---

## Commands to resume

From this repo root:

```bash
# Re-run Monte Carlo
python3 /tmp/prop_sim.py   # regenerate if gone

# Check current strategy
cat ninjascript/UnifiedOrbStrategy.cs | head -50

# Read the AI briefing plan
cat docs/ai-briefing-plan.md
```

In Claude Code: point the new session to this file first, then to `docs/ai-briefing-plan.md`.
