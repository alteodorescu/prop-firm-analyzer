# AI Briefing Integration — Implementation Plan

**Status:** ⏸ Deferred. To be implemented after the current strategy optimization cycle completes and we have locked Sortino-robust filter + exit parameters.

**Owner:** prop-firm-analyzer repo (React + Supabase + NinjaScript)

---

## Context and intent

The NinjaScript strategy (`UnifiedOrbStrategy.cs`) is deterministic and the React app (`prop-firm-analyzer`) already computes per-account sizing via the Unified Objective card. The user wants to layer a daily AI briefing that:

1. Runs at market pre-open, reads overnight + calendar + recent-performance context, and emits a regime read plus specific strategy-parameter recommendations for the day.
2. **Posts a human-readable summary to Telegram** (same chat already used by the NinjaScript for trade alerts).
3. **Optionally** applies those recommendations to the live NinjaScript strategy automatically, with the user choosing between:
   - **Manual mode** (default): user sees the brief in the React app and taps "Apply" to push values to NinjaScript.
   - **Automatic mode**: recommendations flow to NinjaScript without user intervention, bounded by hard safety caps.

The AI does NOT make trade decisions. It tunes strategy inputs (ADX threshold, sizing multiplier, session skip, etc.) once per day.

---

## Deliverables

### 1. Supabase backend

**New table** `ai_briefings`:
```sql
id                 uuid primary key
user_id            uuid not null references auth.users
brief_date         date not null
regime             text not null      -- "trending" | "range-bound" | "high-vol" | "mixed"
conviction         numeric            -- 0..1
recommendations    jsonb not null     -- structured params (see below)
reasoning          text               -- 2-3 sentence narrative
telegram_message   text               -- the formatted message that was sent
telegram_sent_at   timestamptz
applied_mode       text               -- "manual" | "auto" | "skipped"
applied_at         timestamptz
raw_llm_response   jsonb              -- full LLM response for audit
created_at         timestamptz default now()
```

**New table** `ai_briefing_settings` (per-user):
```sql
user_id                uuid primary key references auth.users
enabled                bool default false
auto_apply             bool default false     -- Manual (false) or Automatic (true)
telegram_enabled       bool default true
telegram_chat_id       text
llm_model              text default 'claude-haiku-4-5'
max_sizing_multiplier  numeric default 1.0    -- AI cannot scale size above this
min_sizing_multiplier  numeric default 0.5
allowed_params         jsonb                  -- whitelist of params AI can touch
run_time_et            time default '08:00'   -- when daily brief fires
created_at / updated_at
```

**New table** `active_strategy_config` (single row per user, read by NinjaScript polling):
```sql
user_id                    uuid primary key
contracts                  int
tp_points                  numeric
adx_threshold              int
skip_london                bool
skip_newyork               bool
sizing_multiplier          numeric default 1.0
max_daily_loss             numeric
updated_at                 timestamptz
updated_by                 text               -- "user" | "ai_auto" | "ai_manual_apply"
```

### 2. Supabase Edge Function: `run-ai-briefing`

Cron-triggered daily at user's `run_time_et`. One function serves all users; iterates over those with `enabled = true`.

Pseudocode:
```
for each user with enabled=true:
    context = {
        overnight:       fetch NQ 1h OHLC last 24h (provider API or cached NT export),
        calendar:        fetch today's high-impact economic events,
        fedSpeakers:     fetch scheduled Fed speakers,
        recent:          last 10 trading days of strategy journal from Supabase,
        correlated:      ES/YM/RTY/VIX overnight moves,
        currentConfig:   current active_strategy_config row,
    }

    response = call Claude API with:
        model         = ai_briefing_settings.llm_model
        system_prompt = ./prompts/briefing-system.txt (checked-in asset)
        user_prompt   = formatted context JSON

    parsed = parse response as { regime, conviction, recommendations, reasoning }

    telegram_msg = format_human_readable(parsed)
    send_to_telegram(telegram_chat_id, telegram_msg)

    insert into ai_briefings (...)

    if ai_briefing_settings.auto_apply:
        clamped = apply_safety_caps(parsed.recommendations, settings)
        update active_strategy_config set ... where user_id = ...
        update ai_briefings set applied_mode='auto', applied_at=now()
    else:
        # Stays in 'skipped' until user clicks Apply in the React app
        pass
```

**Data sources (Phase-1 choices):**
- **Economic calendar**: ForexFactory XML feed (free, reliable)
- **Fed speakers**: scraped from Federal Reserve website OR same ForexFactory feed
- **Overnight NQ OHLC**: Yahoo Finance (`^NQ=F`) via yfinance-equivalent HTTPS call (free, 1-hour bars)
- **Correlated markets**: same Yahoo source for `^ES=F`, `^YM=F`, `^RTY=F`, `^VIX`

No paid data subscription needed for Phase 1.

### 3. LLM prompt structure

**System prompt** (`./supabase/functions/run-ai-briefing/prompts/briefing-system.txt`):
- Role: "NQ futures day-trading assistant, strategy-parameter tuner only."
- Output format: strict JSON with keys `regime`, `conviction`, `recommendations`, `reasoning`, `telegram_message`.
- Constraints: "Never recommend increasing size above user's cap. Never recommend disabling stop losses. Suggest `skip_london=true` only if high-impact pre-NY news within OR window."
- Hard rules: temperature 0.2 (reduce variance), max tokens 2000.

**User prompt template**:
- Structured JSON of all context above.
- Recent-performance delta ("strategy has been stopped out 6 of last 10 days — ADX filter may be too loose").

### 4. Telegram formatter

Converts LLM output JSON → Markdown message for Telegram. Example:

```
🌅 *Morning Brief — 2026-04-17*

*Regime:* 📉 Range-bound (conviction 70%)

*Today's key events*
• 08:30 ET — Core CPI (high impact)
• 14:00 ET — Powell speech (high impact)

*Recommendations applied automatically* ✅
• ADX threshold: 25 → 28 (tighter regime filter)
• Size multiplier: 1.0 → 0.5 (half contracts for the day)
• Skip London session: yes (post-CPI chop window)

*Reasoning*
Recent 10 days show declining ADX (avg 22) and tightening 
range. CPI + Fed combo historically doubles intraday whipsaw. 
Recommend defensive posture. If CPI surprise >0.3%, trailing 
stop will naturally expand.
```

When mode is `manual`, the line "Recommendations applied automatically" becomes:
```
*Recommendations awaiting your approval* ⏸
_Open the app to review and apply._
```

Implementation: ~60 lines in the Edge Function. Uses `telegram_bot_api.sendMessage` with `parse_mode=Markdown`.

### 5. NinjaScript integration: config polling

The hardest piece — getting cloud-side AI recommendations into a running NinjaScript strategy.

**Chosen approach: polled pull from NinjaScript.**

Add a new optional feature to `UnifiedOrbStrategy.cs`:
- `[NinjaScriptProperty]` **`AiConfigEnabled`** (bool, default false)
- `[NinjaScriptProperty]` **`AiConfigEndpoint`** (string, Supabase REST URL)
- `[NinjaScriptProperty]` **`AiConfigApiKey`** (string, Supabase anon key)
- `[NinjaScriptProperty]` **`AiConfigPollMinutes`** (int, default 5)

Behavior:
- On strategy start: pull config once.
- Every N minutes (per bar-time check): pull again.
- On success: apply params to internal state with guards:
  - Don't change mid-position (wait until flat).
  - Log every change to Print + Telegram.
  - Respect hard caps (never go above user-set MaxContracts).
- On failure: keep current params, log warning. Never stop trading over a poll failure.

HTTP call uses the same `HttpClient` pattern as the Telegram integration. Silent-fail on network errors.

This gives us cloud → NT delivery with minimal surface area. No need for a local polling service.

### 6. React app: "AI Brief" panel

**New card** in the Account Tracker tab, above the Unified Objective:

- Regime badge (color-coded)
- Today's events list with timestamps
- Recommended params (diff against current active config)
- **Manual mode**: ⏸ "Apply" button — copies to `active_strategy_config` → picked up by NinjaScript on next poll.
- **Automatic mode**: ✅ "Applied automatically at 08:02 ET" timestamp — read-only.
- Reasoning text
- Link to Telegram message (if sent)

**New settings page**: "AI Briefing Settings"
- Enable / disable
- Mode toggle: Manual / Automatic
- Telegram forwarding (chat ID, bot token — can reuse NinjaScript's Telegram creds)
- LLM model picker (Haiku / Sonnet)
- Safety caps:
  - Max sizing multiplier (0.1 to 1.0, default 1.0)
  - Min sizing multiplier (0.1 to 1.0, default 0.5)
  - Allow-list of params AI can modify (checkboxes)
- Run time (hour:minute ET)
- History log (last 30 briefings, outcomes)

### 7. Safety rails (non-negotiable)

Before any code ships, these must be true:

1. **Hard caps enforced in Supabase, not just client-side**: `active_strategy_config` trigger rejects writes that exceed `max_sizing_multiplier` or similar. AI cannot bypass by prompt injection.
2. **Audit trail**: every change logged with source (`user` / `ai_auto` / `ai_manual_apply`) and timestamp. Queryable history.
3. **Kill switch**: single button in React disables all AI behavior. Writes `enabled=false`. Next Edge Function invocation is a no-op.
4. **No SL changes**: LLM prompt explicitly disallows recommending SL removal or loosening daily loss caps. Edge Function validates output.
5. **Initial 2-week shadow mode**: new accounts default to Manual with auto-apply disabled. User must explicitly opt in to Automatic.
6. **Divergence logging**: if Manual mode, record what the user actually did vs what the AI recommended. Use for post-hoc analysis and model improvement.

### 8. Rollout phases

| Phase | Deliverable | Effort |
|---|---|---|
| 0 | Schema + Edge Function stub, logs briefings with placeholder LLM call | 2h |
| 1 | Real LLM integration, Telegram formatter, stored briefing | 3h |
| 2 | React UI: brief display card + Manual "Apply" button | 3h |
| 3 | NinjaScript config-polling extension + active_strategy_config endpoint | 3h |
| 4 | Automatic-apply mode + safety caps enforcement | 2h |
| 5 | Settings page + history log | 2h |
| **Total** | working Layer 1 end-to-end | **~15h** |

---

## Dependencies to resolve before starting

1. **Confirm Anthropic API key source**: create a new one dedicated to this project? Reuse existing?
2. **Telegram credentials**: reuse the NinjaScript bot token/chat ID or provision a separate one for morning briefings?
3. **Economic calendar source**: confirm ForexFactory XML is acceptable, OR upgrade to a paid provider (TradingEconomics $50/mo) for SLA.
4. **Edge Function runtime**: Supabase's Deno runtime supports `fetch`, Anthropic SDK works via raw HTTPS. No additional infrastructure needed.
5. **NT machine network access**: the VPS running NinjaTrader must be able to reach Supabase REST endpoint (allowlist `*.supabase.co` in any firewall).

---

## Explicit non-goals

- **Real-time filter augmentation** (Layer 3 in the original discussion) — not building. Latency and non-determinism kill it.
- **Trade prediction / forecasting** — never. Out of scope forever.
- **AI-driven backtesting / optimization** — we use grid search + Sortino; this is solved.
- **Replacing the NinjaScript strategy** — the EA port is the execution engine. AI sits above it, not in it.

---

## Acceptance criteria

Phase 1 (Layer 1, manual-apply) is done when:

1. Brief fires at user's configured time ±5 min.
2. Telegram message is readable, Markdown-formatted, includes regime + 2-3 events + recommendations + reasoning.
3. React card displays today's brief with Apply button working.
4. Clicking Apply updates `active_strategy_config`; NinjaScript poll picks it up within `AiConfigPollMinutes`.
5. Safety caps enforced — user cannot (and AI cannot) set size above configured max.
6. Full audit log of all changes visible in history tab.

Automatic-apply is ready when:
- Phase 1 criteria all pass
- Shadow mode test: 14 consecutive days in Manual mode, user's applied-vs-recommended divergence reviewed, LLM recommendations don't trigger safety caps more than once per week.
- Only then, user can opt into Automatic.

---

## Return here after optimization

When the current Sortino-ratio optimization locks in filter + exit parameters, return to this plan. No code changes needed to the NinjaScript strategy at that point except adding the 4 `AiConfig*` properties and the periodic polling logic — about 80 lines total.
