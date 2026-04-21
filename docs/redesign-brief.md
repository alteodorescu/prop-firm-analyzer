# Frontend redesign — brief

## Audit findings (from screenshots + code review)

### Desktop @ 1440px — what's actually wrong

| Tab | Pain point | Evidence |
|---|---|---|
| **Comparison** | 9-col table overflows below ~1280px (MAX NET PROFIT clipped). Legend chips float awkwardly in the content body instead of living with the table. Top-pick banner is a free-form text blob with tiny icons — feels like a notification, not a hero. | Screenshot 1 (desktop 1280). Row-color tinting on rank is subtle — hard to scan. |
| **Firm Details** | One column of huge cards down the middle of a 1440px screen. Each firm card has four tinted KPI tiles eating ~110px of vertical for 4 numbers. Four collapsibles stacked vertically — 1800px of scroll per firm. | Screenshot 2. At 1440×900, I see **one** firm + peek of next = massive waste. |
| **Account Tracker** | (Not shot live — auth-gated — but read from code: `AccountCard` is 930 lines.) Each card has section headers (`Section` component) nested deep, full-width "Today's Trading Plan" block, payout/reset lists, rule ledger. On desktop it's a single column. | Grep: `AccountCard` at line 2514, ~930 lines. Each card likely > 1 viewport tall. |
| **Financial Dashboard** | `DashKpi` + `DashTable` stack vertically. | Code: `FinancialDashboard` at 3906, ~380 lines. |
| **Metrics Guide** | Narrow centered text column on a 1440px canvas. No sidebar TOC, no quick-jump. Every formula is inside its own card with a huge header. | Screenshot 3. |
| **Auth** | Actually fine. 420px centered card. | Screenshot 4. |

### Mobile @ 375px — the real mess

1. **Tab bar wraps to 3 lines.** 180px of header on a 812-tall viewport = 22% lost to nav before content. This is the #1 mobile blocker. *(Screenshots 5 and 6.)*
2. **App title truncates** ("Futures Prop …") — brand unreadable.
3. **Comparison table is horizontally unusable.** Only rank + name + overall ease fit; user can't compare anything.
4. **Top-pick banner breaks into vertical ribbons** instead of a compact summary.
5. **AccountCard** (inferred): already 930 lines of desktop-tuned layout — almost certainly painful on mobile.

### Cross-cutting issues

- **Visual language is generic slate-card-on-slate-bg.** It works but it's Bootstrap-era — user asked for "fresh."
- **Navigation is a single row of text tabs** with emoji prefixes in the labels (`"📊 Comparison"`). Emojis in nav feel amateur vs. Linear/Stripe-grade.
- **Information density is inverted.** Padding is generous (py-4, px-5 everywhere), content is small (text-[13px]), and multi-column layouts aren't used at all. Desktop-first with lots of data → this is exactly backwards.
- **No surface hierarchy.** Everything is `white card on slate-50 bg`. Can't tell which thing is primary.

---

## Design direction

### Pillars
1. **Information density via layout, not typography.** Tighten the container padding (p-5 → p-4 or p-3), use 2–3 column grids on desktop, but keep text at comfortable sizes (13–14px body). "Notion-airy" = breathing room *inside* content, not padded chrome around it.
2. **Fresh visual treatment.**
   - Move from slate-only to a **warmer neutral** — `zinc-50/900` base with a single blue accent is cleaner than the current slate (slate has a blue-green tint that clashes with the blue accent).
   - **Drop `shadow-soft` on every card.** Modern dashboards use borders + a single elevation layer (only popovers/modals get shadows). Current everything-shadowed look reads Bootstrap 2015.
   - **Rounded corners go from `rounded-xl` (12px) to `rounded-lg` (8px)** — tighter, more Linear-esque. Modals stay `rounded-xl`.
   - **Semantic accent review:** amber brand color (🏆) stays but constrained to brand moments. Emerald/red for P&L only. Drop color-tinted KPI backgrounds — use a small color chip + neutral surface.
3. **Structural navigation.**
   - **Desktop (≥1024px):** collapsible left sidebar (64/240px wide) with icon + label nav, global user/theme controls dock to the bottom of the sidebar. Frees up vertical space above content. No more emoji in labels.
   - **Mobile (<1024px):** persistent bottom nav (home row of 4 icons + "more"). Top bar shrinks to brand + context actions. This fixes the 3-line tab wrap.
4. **Responsive table strategy.** Tables become **stacked cards** below 768px. Above that, tables stay but with sticky-first-column + horizontal scroll for narrow desktops.

### Tokens (new)

```
colors:
  surface:
    base   = zinc-50  / zinc-950
    raised = white    / zinc-900
    sunken = zinc-100 / zinc-900/60
  border:
    default = zinc-200 / zinc-800
    strong  = zinc-300 / zinc-700
  text:
    primary   = zinc-900 / zinc-50
    secondary = zinc-600 / zinc-400
    tertiary  = zinc-500 / zinc-500
  accent: blue-600 (unchanged)
  brand:  amber-500 (reserved for 🏆 hero moments, not decoration)
  data:   emerald-600 (good), red-600 (bad), amber-500 (warn)

radii: md=6px, lg=8px, xl=12px (modal only)

spacing scale used in layout:
  card-pad   = 14px (p-3.5)  — was 20px (p-5)
  section-gap = 16px (space-y-4) — was 20px
  page-pad   = 24px — was 24px (keep)

shadow policy:
  surfaces: none (border only)
  overlays: shadow-lg (modals, dropdowns, tooltips)
  hover:    subtle ring-1 ring-blue-500/20 on clickable rows
```

### Component changes (the short list)

| Primitive | Change |
|---|---|
| `Card` | Remove default `shadow-soft`. Default to border only. New `elevated` variant for modals/dropdowns. Reduce padding. |
| `CardHeader` | `py-4 px-5` → `py-3 px-3.5`. Title size `text-sm` stays. |
| `CardBody` | `py-4 px-5` → `py-3 px-3.5`. |
| `Tabs` | **Remove** in the new navigation model. Keep for inner-tab UI (e.g. Firm Details collapsibles). |
| `StatTile` | Flatten — drop tinted chip backgrounds. Label + value in compact row, trend chip on right. New `dense` variant for data-heavy grids. |
| `Badge` | Fine as-is. Maybe a `subtle` variant without border. |
| New: `DataTable` | Sticky header, sticky first col on desktop. Switches to card-list below `md`. Bring consistency to Comparison + any future tables. |
| New: `NavRail` | Desktop sidebar. Collapsible, remembers state in localStorage. |
| New: `BottomNav` | Mobile bottom nav with 4 primary + 1 "more" sheet. |
| New: `PageHeader` | Replaces the big on-page H2 blocks. Standardized title/desc/actions layout. |
| New: `KpiRow` | Horizontal row of 4–6 dense KPIs, properly responsive (3-col on tablet, horizontal scroll on mobile). |
| `Modal` | Keep current, just refine shadow intensity and max-height behavior for mobile (full-screen sheet on <640px). |

### Per-tab redesign (concrete)

#### Comparison
- Replace rank column + color stripe with a **sparkline column** showing ease % bar-within-cell (more info, same footprint).
- Move legend (green/amber/red) **into the column header tooltip**, not floating above.
- Promote **top pick** to a proper hero card at the top: rank 1 + 4 headline numbers + "view full details" CTA. Subsequent rows are the table.
- On mobile: table becomes card-list, one firm per card, with 3 primary metrics + expand for rest.

#### Firm Details
- Two-column grid on desktop (≥1280px): left = identity + KPI row + cost/balance facts, right = the four collapsible rule sections rendered **inline** (no accordion — they fit).
- KPI row: 4 dense tiles in a strip (no tinted backgrounds; just label + value + small semantic chip).
- Each firm card height shrinks ~60%.
- Sort control moves into a compact **filter bar** (sticky under header).

#### Account Tracker
- Already has filter pills (recent change — keep).
- **Redesign `AccountCard`**: split into a **compact header row** (firm, label, phase badge, status chip, 3 live KPIs, collapse/select) + **expanding drawer** containing Today's Plan + Rules + Payouts/Resets. Default state = collapsed, so the page shows 8–10 accounts without scrolling.
- Add a new **list/grid view toggle** — grid for overview, list for data dive.
- "Unified Trade Copier Objective" card (shows when ≥2 accounts) becomes a **sticky summary strip** above the list.

#### Financial Dashboard
- Top: 4–6 headline KPIs in a dense strip (total P&L, ROI, payouts, accounts, reset cost, break-even date).
- Below: two-column grid — left = monthly P&L bar chart (new), right = by-firm leaderboard.
- Below that: full-width cumulative P&L line (keep), then the tables (month/year/firm) as proper `DataTable` with sorting.
- Archived accounts auto-included (already the case — verified in prior session).

#### Metrics Guide
- Add a **left rail TOC** (sticky) with anchor jumps to each metric.
- Each metric card tightens: formula in one line if it fits, inputs as a 2-col list, example in a compact code block.
- Replaces the "everything is centered" layout.

#### Admin, Auth
- Admin: minor pass — tighten row spacing, convert to a real `DataTable`.
- Auth: keep current treatment. Just update colors to match new tokens.

### Out of scope (call-outs)

- No new charts library unless there's a gap — use the lightweight SVG approach already present (cumulativePnl).
- No i18n key restructuring — existing `t()` keys stay valid.
- No Supabase/data-layer changes.
- No route-based navigation — tab state stays in `useState`.
- RichTextEditor (journal) stays as-is; not a visual priority.

---

## Phased execution plan (revised with concrete effort estimates)

| # | Phase | Files touched | Est LOC | Effort | Commit? |
|---|---|---|---|---|---|
| 1 | Tokens + `ui.jsx` primitives (new `DataTable`, `PageHeader`, `KpiRow`, updated `Card`, `StatTile`, `Tabs` kept for inner use only) | `src/ui.jsx`, `tailwind.config.js` | +500 / -150 | 2h | yes |
| 2 | Shell: `NavRail` + `BottomNav` + `TopBar`, route App.jsx shell | `src/App.jsx` top-level (~lines 5900–6158), new `src/shell.jsx` | +400 / -200 | 2h | yes |
| 3 | Account Tracker redesign: compact AccountCard header + drawer | `src/App.jsx` lines 2514–3448 | +300 / -450 | 3h | yes |
| 4 | Financial Dashboard redesign: KPI strip, grid layout, DataTable conversion | `src/App.jsx` lines 3906–4470 | +200 / -250 | 2h | yes |
| 5a | Comparison: DataTable + mobile card view + new hero | `src/App.jsx` lines 1665–2270 | +150 / -200 | 2h | yes |
| 5b | Firm Details: 2-col layout, inline sections | `src/App.jsx` lines 507–900, 6074–... | +150 / -200 | 1.5h | yes |
| 5c | Metrics Guide: sidebar TOC | `src/App.jsx` lines 1389–1570 | +80 / -40 | 1h | yes |
| 6 | Cross-viewport QA w/ screenshots (Claude_Preview), fix last-mile issues | any | +30 / -30 | 1h | yes |

**Total: ~13 hours of work, 7 commits.** Each phase compiles and renders independently; you can bail after any commit and still have a working app.

### Risks / unknowns
- **I don't have login to see Tracker + Dashboard live.** I'll implement from code + re-verify with screenshots after you sign in post-deploy, OR you can paste credentials now (sim/test account) so I can verify inline.
- **Dark mode:** all changes must ship dark-mode-complete. Token design accounts for this but I'll screenshot both modes at phase 6.
- **i18n:** any new strings get added to both `en` and `ro`.
- **The `AccountCard` redesign is the biggest single risk** — it's the most complex component and the most-used tab. Plan: keep the old component around (rename to `AccountCardLegacy`) until I've verified the new one visually.
