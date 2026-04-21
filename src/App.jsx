import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ChevronUp, ArrowUp, ArrowDown, Info, Plus, Pencil, Trash2, X, Award, Sun, Moon, Globe, LogOut, Lock, Shield, UserPlus, UserMinus, Zap, AlertTriangle, AlertCircle, Target, Layers, Users, TrendingUp, TrendingDown, Minus, BarChart3, Building2, Briefcase, LineChart, BookOpen, Trophy, LogIn, ExternalLink, Calculator, Check, CheckCircle2, XCircle, Search, RefreshCw, Upload, FileText, Wallet, Activity, Flame, Ban, ShieldAlert, Filter, ArrowDownWideNarrow, ClipboardList, Clock, Eye, EyeOff, Copy, Code2, Archive } from "lucide-react";
import { Button, IconButton, Tabs as UiTabs, Badge, Card, CardHeader, CardTitle, CardBody, CardDescription, Alert, EmptyState, PageHeader } from "./ui";
import { AppShell } from "./shell.jsx";
import { t, getLang, setLang } from "./i18n.js";
import { useSupabaseData } from "./useSupabaseData.js";
import { supabase } from "./supabaseClient.js";

// ═══════════════════════════════════════════════════════════
// TOOLTIP HELP TEXTS
// ═══════════════════════════════════════════════════════════
const TIPS = {
  cost: "Monthly or one-time fee to access the evaluation. Lower is better.",
  pt: "Profit Target — the profit you must reach to pass the evaluation.",
  dll: "Daily Loss Limit — max loss per session before trading pauses. None = full MLL available per session (preferred for risk-takers).",
  mll: "Max Loss Limit — total drawdown before the account is breached. Higher = more runway.",
  mllType: "Drawdown type affects how the MLL moves:\n• Static — MLL stays fixed from start. Best case.\n• Trailing EOD — MLL floor trails up based on highest end-of-day balance. Moderate penalty.\n• Trailing Intraday — MLL floor trails every tick. Severe penalty.\n\nTrailing drawdowns shrink effective room as you profit, making the target harder to reach.",
  consistency: "Max % of total profit from a single day. E.g. 40% → need at least ⌈1/0.4⌉ = 3 profitable days. None = no restriction.",
  minDays: "Minimum profitable trading days required by the firm before you can pass/request payout.",
  minProfit: "Minimum daily profit ($) to count as a 'profitable day' for consistency/payout purposes.",
  daysCalc: "Calculated: MAX(Min profitable days, ⌈1/Consistency⌉). Takes the stricter of the two requirements. If both are empty, defaults to 1.",
  activation: "Fee to activate the funded account after passing the eval. Enter 0 if none.",
  buffer: "Balance above starting equity that must be maintained before requesting payout. 0 = no buffer required.",
  minPayout: "Minimum amount per payout request allowed by the firm.",
  maxPayout: "Maximum amount per payout request (what we target in the funded plan).",
  split: "Your share of profits. E.g. 90% means the firm keeps 10%.",
  withdrawalPct: "Withdrawal % of profits. 100% = buffer model (withdraw all profit above buffer). <100% = profit-split model (e.g. 50% means you need $4K profit to withdraw $2K). Leave at 100% for most firms.",
  payoutTiers: "Payout limits per payout cycle. Each tier defines the min and max for that payout number (e.g. Payout #1, #2, #3…). Leave max empty on the last tier for unlimited payouts. If only one tier exists, all payouts use those limits.",
  scalingPlan: "Contract scaling limits. Some firms restrict how many contracts you can trade based on accumulated profit. E.g. 2 contracts until $1K, then 3 until $2K, then max. This reduces the effective Ease Score because you earn slower in early tiers. Leave empty if no scaling.",
  scalingFactor: "Weighted average contracts ÷ max contracts. 100% = no scaling (full contracts from the start). <100% = fewer contracts in early tiers. Multiplied into the Ease Score.",
  easeToPass: "Room Score × Days Factor × Scaling Factor. Measures how easy the evaluation is.\n\nMLL is adjusted for trailing drawdowns:\n• Static: uses raw MLL\n• Trailing EOD: effectiveMLL = MLL² / (MLL + 0.5×Target)\n• Trailing Intraday: effectiveMLL = MLL² / (MLL + Target)\n\nRoom = DLL exists? (DLL/eMLL)×(1+log₂(eMLL/DLL)×0.25) : eMLL/PT\nDays Factor = (1/eff_days)^0.3\nScaling Factor = weighted avg contracts / max contracts\n\nHigher = easier.",
  easeToGetPaid: "Same formula as Ease to Pass but with funded parameters and funded scaling.\n\nTarget = MAX(Buffer + Max Payout, Max Payout ÷ Withdrawal %).\nMLL adjusted for trailing drawdown type (same formula).\n\nMeasures how easy it is to accumulate enough profit to request the maximum payout.",
  overallEase: "Geometric mean: √(Pass × Paid). Penalizes imbalance — if either metric is low, the overall score drops. A firm needs BOTH to be decent for a high overall score.",
  totalCost: "Eval cost + Activation fee. Your total cash outlay before receiving any payout.",
  totalDays: "Days to Pass + Days to Payout. Minimum trading days from starting the eval to first payout.",
  netProfit: "Net payout (Payout × Split) minus Total Cost. What you actually pocket.",
  roi: "Net Profit ÷ Total Cost. How much you earn per dollar invested.",
  dailyProfitRate: "Max Net Profit ÷ Total Days. Your effective earning rate per trading day if you hit max payout. Higher = better time efficiency.",
  dailyTarget: "Total profit needed ÷ Effective days. The dollar amount you must profit each active trading day.",
  reqBalance: "Buffer + Payout amount. The balance above the drawdown floor needed to request a payout.",
  maxNQ: "Maximum number of NQ (Nasdaq) mini contracts allowed simultaneously in the funded account.",
  resetCost: "Cost to reset/retry the evaluation after a failed attempt. Used to calculate how many resets you can afford before the total investment exceeds your max payout. Leave blank to default to eval cost, or set N/A if the firm offers no resets.",
  resetsToBreakeven: "How many times you can fail and reset the eval before your total spend (eval + resets + activation) exceeds the max net payout. Higher = more margin for error. Formula: ⌊(Max Net Payout − Eval Cost − Activation) ÷ Reset Cost⌋.",
};

// ═══════════════════════════════════════════════════════════
// INITIAL FIRMS DATA
// ═══════════════════════════════════════════════════════════
let nextId = 1;

// ═══════════════════════════════════════════════════════════
// CALCULATIONS
// ═══════════════════════════════════════════════════════════
function calcDays(consistency, minDays) {
  const hasC = consistency != null && consistency > 0;
  const hasM = minDays != null && minDays > 0;
  if (!hasC && !hasM) return 1;
  if (!hasC) return minDays;
  if (!hasM) return Math.ceil(1 / consistency);
  return Math.max(minDays, Math.ceil(1 / consistency));
}

// tiers: array of {upTo, contracts} sorted by upTo ascending
// The last tier's upTo acts as the ceiling; above that → cmax contracts
function calcScalingFactor(tiers, cmax, target) {
  if (!tiers || tiers.length === 0 || cmax == null || cmax <= 0 || target == null || target <= 0) return 1;
  let wa = 0;
  let prev = 0;
  for (const tier of tiers) {
    if (tier.upTo == null || tier.contracts == null) continue;
    const end = Math.min(tier.upTo, target);
    if (end > prev) {
      wa += tier.contracts * (end - prev);
    }
    prev = end;
    if (prev >= target) break;
  }
  // Remaining range above last tier → max contracts
  if (prev < target) {
    wa += cmax * (target - prev);
  }
  return wa / (target * cmax);
}

// Migrate legacy scT1/scC1... fields to tiers array
function migrateScalingTiers(f, prefix) {
  // prefix is "sc" for challenge, "sf" for funded
  const tiers = f[prefix === "sc" ? "scalingChal" : "scalingFund"];
  if (tiers && tiers.length > 0) return tiers;
  // Try legacy fields
  const result = [];
  for (let i = 1; i <= 3; i++) {
    const t = f[`${prefix}T${i}`];
    const c = f[`${prefix}C${i}`];
    if (t != null && c != null) result.push({ upTo: t, contracts: c });
  }
  return result.length > 0 ? result : [];
}

// Migrate legacy minPayout/maxPayout to payoutTiers array
function migratePayoutTiers(f) {
  if (f.payoutTiers && f.payoutTiers.length > 0) return f.payoutTiers;
  // Legacy: single min/max payout → one tier
  if (f.minPayout != null || f.maxPayout != null) {
    return [{ min: f.minPayout || 0, max: f.maxPayout || null }];
  }
  return [];
}

// Get payout limits for a specific payout number (1-indexed)
function getPayoutTierForNumber(payoutTiers, payoutNum) {
  if (!payoutTiers || payoutTiers.length === 0) return { min: 0, max: null };
  // If payoutNum exceeds tiers, use the last tier
  const idx = Math.min(payoutNum - 1, payoutTiers.length - 1);
  return payoutTiers[idx];
}

// Get contracts allowed at a given profit level based on scaling tiers
function getContractsAtProfit(tiers, cmax, profit) {
  if (!tiers || tiers.length === 0 || !cmax) return cmax || null;
  for (const tier of tiers) {
    if (tier.upTo != null && profit <= tier.upTo) return tier.contracts;
  }
  // Above all tiers → max contracts
  return cmax;
}

// Trailing drawdown penalty: converts trailing MLL to static-equivalent MLL
// Static (k=0): no change. EOD trailing (k=0.5): moderate penalty. Intraday trailing (k=1.0): severe penalty.
// Formula: effectiveMLL = MLL² / (MLL + k × target)
// Intuition: as target grows relative to MLL, trailing floor eats more of your room.
function effectiveMll(mll, target, mllType) {
  if (!mll || !target || target <= 0) return mll;
  if (!mllType || mllType === "static") return mll;
  const k = mllType === "intraday" ? 1.0 : 0.5; // "eod" = 0.5
  return (mll * mll) / (mll + k * target);
}

function calcEase(dll, mll, target, consistency, minDays, scalingFactor, mllType) {
  if (!mll || !target || target <= 0) return null;
  const eMll = effectiveMll(mll, target, mllType);
  const days = calcDays(consistency, minDays);
  let room;
  if (dll != null && dll > 0) {
    room = (dll / target) * (1 + Math.log2(eMll / dll) * 0.25);
  } else {
    room = eMll / target;
  }
  return room * Math.pow(days, -0.3) * (scalingFactor || 1);
}

function computeAll(f) {
  const isInstant = !!f.instant;
  const daysToPass = isInstant ? 0 : calcDays(f.consistency, f.minDays);
  const daysToPayout = calcDays(f.fConsistency, f.fMinDays);
  const payoutTiers = migratePayoutTiers(f);
  // For backward compat & calculations: use first tier for min, first tier's max for max
  // If no tiers, fall back to legacy fields
  const tier1 = payoutTiers.length > 0 ? payoutTiers[0] : { min: f.minPayout || 0, max: f.maxPayout || null };
  const effectiveMinPayout = tier1.min || 0;
  const effectiveMaxPayout = tier1.max || f.maxPayout || 0;
  const minNetPayout = effectiveMinPayout * (f.split || 0);
  const maxNetPayout = effectiveMaxPayout * (f.split || 0);
  const reqBalMin = (f.buffer || 0) + effectiveMinPayout;
  const wpct = (f.withdrawalPct != null && f.withdrawalPct > 0) ? f.withdrawalPct : 1;
  const reqBalMax = Math.max((f.buffer || 0) + effectiveMaxPayout, effectiveMaxPayout / wpct);
  const totalCost = (f.cost || 0) + (isInstant ? 0 : (f.activation || 0));
  const totalDays = daysToPass + daysToPayout;
  const minNetProfit = minNetPayout - totalCost;
  const maxNetProfit = maxNetPayout - totalCost;
  const chalTiers = isInstant ? [] : migrateScalingTiers(f, "sc");
  const fundTiers = migrateScalingTiers(f, "sf");
  const chalScalingFactor = isInstant ? 1 : calcScalingFactor(chalTiers, f.maxNQ, f.pt);
  const fundScalingFactor = calcScalingFactor(fundTiers, f.maxNQ, reqBalMax);
  const easeToPass = isInstant ? null : calcEase(f.dll, f.mll, f.pt, f.consistency, f.minDays, chalScalingFactor, f.mllType);
  const easeToGetPaid = calcEase(f.fDll, f.fMll, reqBalMax, f.fConsistency, f.fMinDays, fundScalingFactor, f.fMllType);
  // For instant funded: overall ease = funded ease (no challenge barrier)
  const overallEase = isInstant ? easeToGetPaid : ((easeToPass != null && easeToGetPaid != null) ? Math.sqrt(easeToPass * easeToGetPaid) : null);
  const minRoi = totalCost > 0 ? minNetProfit / totalCost : null;
  const maxRoi = totalCost > 0 ? maxNetProfit / totalCost : null;
  const chalTarget = isInstant ? 0 : (daysToPass > 0 ? (f.pt || 0) / daysToPass : 0);
  const fundTarget = daysToPayout > 0 ? reqBalMax / daysToPayout : 0;
  const dailyProfitRate = totalDays > 0 ? maxNetProfit / totalDays : null;
  const noResets = f.resetCost === "na";
  const resetPrice = noResets ? null : (f.resetCost != null && f.resetCost > 0 ? f.resetCost : (f.cost || 0));
  const resetsToBreakeven = noResets ? null : (resetPrice > 0 && maxNetProfit > 0 ? Math.floor((maxNetProfit) / resetPrice) : null);
  return { ...f, isInstant, daysToPass, daysToPayout, minNetPayout, maxNetPayout, reqBalMin, reqBalMax, totalCost, totalDays, minNetProfit, maxNetProfit, easeToPass, easeToGetPaid, overallEase, minRoi, maxRoi, chalTarget, fundTarget, chalScalingFactor, fundScalingFactor, dailyProfitRate, resetPrice, resetsToBreakeven, noResets, payoutTiers, minPayout: effectiveMinPayout, maxPayout: effectiveMaxPayout };
}

// ═══════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════
const pct = v => v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const money = v => {
  if (v == null) return "—";
  const neg = v < 0;
  const s = Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-$${s}` : `$${s}`;
};
const easeClr = v => {
  if (v == null) return "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500";
  if (v >= .45) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (v >= .25) return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400";
};
const easeBorder = v => {
  if (v == null) return "border-slate-200 dark:border-slate-800";
  if (v >= .45) return "border-emerald-300 dark:border-emerald-700/60";
  if (v >= .25) return "border-amber-300 dark:border-amber-700/60";
  return "border-red-300 dark:border-red-700/60";
};
// Accent strip (used on FirmCard left edge)
const easeAccent = v => {
  if (v == null) return "bg-slate-200 dark:bg-slate-700";
  if (v >= .45) return "bg-emerald-400 dark:bg-emerald-500";
  if (v >= .25) return "bg-amber-400 dark:bg-amber-500";
  return "bg-red-400 dark:bg-red-500";
};
// Tier label for accessibility
const easeTier = v => {
  if (v == null) return "unknown";
  if (v >= .45) return "easy";
  if (v >= .25) return "moderate";
  return "hard";
};

const getSortOpts = () => [
  { key:"overallEase", label:t("sortOverallEase"), desc:true },
  { key:"easeToPass", label:t("sortEaseToPass"), desc:true },
  { key:"easeToGetPaid", label:t("sortEaseToGetPaid"), desc:true },
  { key:"maxRoi", label:t("sortMaxRoi"), desc:true },
  { key:"totalCost", label:t("sortLowestCost"), desc:false },
  { key:"maxNetProfit", label:t("sortMaxProfit"), desc:true },
  { key:"dailyProfitRate", label:t("sortDailyRate"), desc:true },
  { key:"resetsToBreakeven", label:t("sortMostResets"), desc:true },
];

// ═══════════════════════════════════════════════════════════
// SMALL UI COMPONENTS
// ═══════════════════════════════════════════════════════════
function Tip({ text }) {
  const [show, setShow] = useState(false);
  const iconRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      let left = rect.left + rect.width / 2;
      // Clamp so the 288px-wide tooltip doesn't overflow viewport
      left = Math.max(152, Math.min(left, window.innerWidth - 152));
      setPos({ top: rect.top - 8, left });
    }
  }, []);

  useEffect(() => {
    if (show) { updatePos(); window.addEventListener("scroll", updatePos, true); }
    return () => window.removeEventListener("scroll", updatePos, true);
  }, [show, updatePos]);

  return (
    <span className="inline-block ml-1">
      <Info
        ref={iconRef}
        size={12}
        strokeWidth={2.25}
        className="inline-block cursor-help align-middle text-slate-400 transition-colors hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
        aria-hidden="true"
        onClick={() => { setShow(!show); updatePos(); }}
        onMouseEnter={() => { setShow(true); updatePos(); }}
        onMouseLeave={() => setShow(false)}
      />
      {show && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[9999] w-72 whitespace-pre-line rounded-lg bg-slate-900 px-3 py-2.5 text-[12px] leading-relaxed text-slate-100 shadow-soft-lg ring-1 ring-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-300"
          style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}
        >
          {text}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-full border-4 border-transparent border-t-slate-900 dark:border-t-slate-100"
            style={{ transform: "translateX(-50%)" }}
          />
        </div>,
        document.body
      )}
    </span>
  );
}

// Rich notes: supports **bold**, *italic*, ==highlight==, ~~strike~~, and newlines
function renderRichNotes(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/==(.+?)==/g, '<mark style="background:#fef08a;padding:1px 3px;border-radius:2px">$1</mark>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\n/g, '<br/>');
}

function RichTextEditor({ value, onChange }) {
  const ref = useRef(null);
  const wrap = (before, after) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = value || "";
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    onChange(newText);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length); }, 0);
  };

  const toolBtn = "inline-flex h-6 w-7 items-center justify-center rounded border border-slate-300 text-[11.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
  return (
    <div className="col-span-2">
      <label className={FIELD_LABEL_CLS}>{t("notes")}</label>
      <div className="mb-1.5 flex items-center gap-1">
        <button type="button" onClick={() => wrap("**","**")} className={toolBtn + " font-bold"} title="Bold (**text**)" aria-label="Bold">B</button>
        <button type="button" onClick={() => wrap("*","*")} className={toolBtn + " italic"} title="Italic (*text*)" aria-label="Italic">I</button>
        <button type="button" onClick={() => wrap("==","==")} className={toolBtn + " !bg-amber-100 !text-amber-900 hover:!bg-amber-200 dark:!bg-amber-900/60 dark:!text-amber-200"} title="Highlight (==text==)" aria-label="Highlight">H</button>
        <button type="button" onClick={() => wrap("~~","~~")} className={toolBtn + " line-through"} title="Strikethrough (~~text~~)" aria-label="Strikethrough">S</button>
        <span className="ml-2 text-[10.5px] text-slate-400 dark:text-slate-500">{t("richTextHelp")}</span>
      </div>
      <textarea
        ref={ref}
        className={FIELD_INPUT_CLS + " resize-none !font-mono"}
        rows={4}
        value={value || ""}
        onChange={e => onChange(e.target.value || null)}
        placeholder={t("specialRulesPlaceholder")}
      />
      {value && (
        <div
          className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[13px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300"
          dangerouslySetInnerHTML={{ __html: renderRichNotes(value) }}
        />
      )}
    </div>
  );
}

// Accent colors map to semantic meaning per section type
const SECTION_ACCENTS = {
  amber:   { chip: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",     stripe: "bg-amber-400 dark:bg-amber-500" },
  orange:  { chip: "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400", stripe: "bg-orange-400 dark:bg-orange-500" },
  blue:    { chip: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",         stripe: "bg-blue-400 dark:bg-blue-500" },
  emerald: { chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400", stripe: "bg-emerald-400 dark:bg-emerald-500" },
  slate:   { chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",       stripe: "bg-slate-300 dark:bg-slate-600" },
};

function Section({ title, open, onToggle, children, accent, icon: Icon }) {
  const a = SECTION_ACCENTS[accent] || SECTION_ACCENTS.slate;
  return (
    <div
      className={
        "mt-2.5 overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors duration-150 " +
        "dark:border-slate-800 dark:bg-slate-900/60"
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={
          "group flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 " +
          "hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 " +
          "dark:hover:bg-slate-800/40"
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={"flex h-5 w-5 shrink-0 items-center justify-center rounded " + a.chip}
          >
            {Icon ? <Icon size={11} strokeWidth={2.5} /> : <span className={"h-2 w-2 rounded-full " + a.stripe} />}
          </span>
          <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          aria-hidden="true"
          className={
            "shrink-0 text-slate-400 transition-transform duration-200 ease-out dark:text-slate-500 " +
            (open ? "rotate-180" : "rotate-0")
          }
        />
      </button>
      <div
        className={
          "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none " +
          (open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tip, sub }) {
  return (
    <div className="py-1">
      <div className="flex items-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {label}
        {tip && <Tip text={tip} />}
      </div>
      <div className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FIELD COMPONENT FOR FORMS
// ═══════════════════════════════════════════════════════════
// Base input classes — used by Field, inline forms, and form dialogs
const FIELD_INPUT_CLS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 shadow-sm " +
  "transition-colors duration-150 " +
  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500";
const FIELD_LABEL_CLS =
  "mb-1 flex items-center text-[11.5px] font-medium text-slate-600 dark:text-slate-400";

function Field({ label, tip, value, onChange, prefix, suffix, placeholder, type, wide }) {
  if (type === "text") {
    return (
      <div className={wide ? "col-span-2" : ""}>
        <label className={FIELD_LABEL_CLS}>{label}{tip && <Tip text={tip} />}</label>
        <input
          type="text"
          className={FIELD_INPUT_CLS}
          value={value || ""}
          onChange={e => onChange(e.target.value || null)}
          placeholder={placeholder}
        />
      </div>
    );
  }
  if (type === "textarea") {
    return (
      <div className="col-span-2">
        <label className={FIELD_LABEL_CLS}>{label}{tip && <Tip text={tip} />}</label>
        <textarea
          className={FIELD_INPUT_CLS + " resize-none"}
          rows={3}
          value={value || ""}
          onChange={e => onChange(e.target.value || null)}
          placeholder={placeholder}
        />
      </div>
    );
  }
  return (
    <div>
      <label className={FIELD_LABEL_CLS}>{label}{tip && <Tip text={tip} />}</label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="shrink-0 text-[13px] text-slate-400 dark:text-slate-500">{prefix}</span>}
        <input
          type="number"
          step="any"
          className={FIELD_INPUT_CLS}
          value={value == null ? "" : value}
          onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={placeholder || "—"}
        />
        {suffix && <span className="shrink-0 text-[13px] text-slate-400 dark:text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FIRM CARD
// ═══════════════════════════════════════════════════════════
// Helper: render an ease tile within the FirmCard KPI row (flat treatment —
// color lives in the value text + a tiny dot, no more full tinted background).
function EaseTile({ value, label, tip, isPrimary }) {
  const clr = easeClr(value);
  // Extract the semantic text-color class from `easeClr` (returns bg+text together)
  // and use only the text portion so the tile stays transparent. Fallback: slate.
  const textCls =
    clr.includes("emerald") ? "text-emerald-700 dark:text-emerald-400" :
    clr.includes("amber")   ? "text-amber-700 dark:text-amber-400" :
    clr.includes("red")     ? "text-red-700 dark:text-red-400" :
                              "text-slate-700 dark:text-slate-300";
  const dotCls =
    clr.includes("emerald") ? "bg-emerald-500" :
    clr.includes("amber")   ? "bg-amber-500" :
    clr.includes("red")     ? "bg-red-500" :
                              "bg-slate-400";
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md border border-slate-100 bg-slate-50/60 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/40"
      title={label}
    >
      <div className={"tabular-nums font-semibold leading-none " + (isPrimary ? "text-[17px]" : "text-[14px]") + " " + textCls}>
        {pct(value)}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
        <span aria-hidden="true" className={"h-1.5 w-1.5 rounded-full " + dotCls} />
        <span>{label}</span>
        {tip && <Tip text={tip} />}
      </div>
    </div>
  );
}

function FirmCard({ firm, rank, onEdit, onDelete }) {
  const [sections, setSections] = useState({});
  const toggle = k => setSections(s => ({ ...s, [k]: !s[k] }));
  const f = firm;

  return (
    <div
      className={
        "group relative overflow-hidden rounded-lg border bg-white transition-colors duration-150 " +
        "dark:bg-slate-900 " +
        easeBorder(f.overallEase)
      }
      aria-label={`${f.name} — ease tier: ${easeTier(f.overallEase)}`}
    >
      {/* Tier accent strip down the left */}
      <span
        aria-hidden="true"
        className={"absolute left-0 top-0 h-full w-[3px] " + easeAccent(f.overallEase)}
      />

      <div className="p-4 pl-5">
        {/* ── Header row ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="shrink-0 pt-0.5">
              <RankBadge rank={rank} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                {f.name}
              </h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                <span className="truncate">{f.model}</span>
                {f.isInstant && (
                  <Badge variant="info" size="sm" icon={Zap}>
                    INSTANT FUNDED
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t("totalCost")}
              </div>
              <div className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {money(f.totalCost)}
              </div>
            </div>
            {(onEdit || onDelete) && (
              <div className="flex items-center gap-1">
                {onEdit && (
                  <IconButton
                    icon={Pencil}
                    label={t("edit")}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onEdit(f)}
                  />
                )}
                {onDelete && (
                  <IconButton
                    icon={Trash2}
                    label={t("delete")}
                    size="icon-sm"
                    variant="ghost-danger"
                    onClick={() => onDelete(f.id)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── KPI tiles row (ease metrics) ── */}
        <div className={"mt-3 grid gap-2 " + (f.isInstant ? "grid-cols-3" : "grid-cols-4")}>
          <EaseTile
            value={f.overallEase}
            label={f.isInstant ? "Ease" : "Overall"}
            tip={TIPS.overallEase}
            isPrimary
          />
          {!f.isInstant && (
            <EaseTile value={f.easeToPass} label="Pass" tip={TIPS.easeToPass} />
          )}
          <EaseTile value={f.easeToGetPaid} label="Paid" tip={TIPS.easeToGetPaid} />
          <div className="flex flex-col items-center justify-center rounded-md border border-slate-100 bg-slate-50/60 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="text-[14px] font-semibold leading-none tabular-nums text-blue-700 dark:text-blue-400">{pct(f.maxRoi)}</div>
            <div className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>ROI</span>
              <Tip text={TIPS.roi} />
            </div>
          </div>
        </div>

        {/* ── Metadata strip ── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-slate-100 py-2 text-[11.5px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <MetaStat
            label="Cost"
            value={f.isInstant ? money(f.cost) : `${money(f.cost)} eval + ${money(f.activation)} act`}
          />
          <MetaStat label="Daily" value={`${money(f.dailyProfitRate)}/d`} />
          <MetaStat
            label="Net"
            value={money(f.maxNetProfit)}
            valueClass={f.maxNetProfit < 0 ? "text-red-600 dark:text-red-400" : ""}
          />
          {!f.noResets && f.resetsToBreakeven != null && (
            <MetaStat label="Resets" value={`${f.resetsToBreakeven}×`} />
          )}
          {f.noResets && <MetaStat label="Resets" value={t("na")} />}
          <MetaStat label="Days" value={f.isInstant ? `${f.daysToPayout}d` : `${f.totalDays}d`} />
        </div>

        {/* ── Collapsible sections ── */}
        {!f.isInstant && (
          <Section
            title={t("challengeRules")}
            open={sections.chal}
            onToggle={() => toggle("chal")}
            accent="amber"
            icon={Target}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              <Stat label={t("profitTarget")} value={money(f.pt)} tip={TIPS.pt} />
              <Stat label={t("dailyLossLimit")} value={f.dll ? money(f.dll) : t("none")} tip={TIPS.dll} />
              <Stat
                label={t("maxLossLimit")}
                value={money(f.mll)}
                tip={TIPS.mll}
                sub={f.mllType && f.mllType !== "static" ? (f.mllType === "eod" ? t("trailingEod") : t("trailingIntraday")) : null}
              />
              <Stat label={t("consistency")} value={f.consistency ? pct(f.consistency) : t("none")} tip={TIPS.consistency} />
              <Stat label={t("minProfitDays")} value={f.minDays || t("none")} tip={TIPS.minDays} />
              <Stat label={t("daysToPass")} value={`${f.daysToPass} ${t("days")}`} tip={TIPS.daysCalc} sub={t("calculated")} />
            </div>
            <BestPlan
              tone="amber"
              target={f.chalTarget}
              days={f.daysToPass}
              endValue={f.pt}
              endLabel={t("profitTarget").toLowerCase()}
            />
            {f.chalScalingFactor < 1 && (
              <ScalingDetail
                factor={f.chalScalingFactor}
                tiers={migrateScalingTiers(f, "sc")}
                maxNQ={f.maxNQ}
              />
            )}
          </Section>
        )}

        <Section
          title={t("fundedRules")}
          open={sections.fund}
          onToggle={() => toggle("fund")}
          accent="orange"
          icon={Briefcase}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Stat label={t("activationFee")} value={money(f.activation)} tip={TIPS.activation} />
            <Stat label={t("dailyLossLimit")} value={f.fDll ? money(f.fDll) : t("none")} tip={TIPS.dll} />
            <Stat
              label={t("maxLossLimit")}
              value={money(f.fMll)}
              tip={TIPS.mll}
              sub={f.fMllType && f.fMllType !== "static" ? (f.fMllType === "eod" ? t("trailingEod") : t("trailingIntraday")) : null}
            />
            <Stat label={t("consistency")} value={f.fConsistency ? pct(f.fConsistency) : t("none")} tip={TIPS.consistency} />
            <Stat label={t("minProfitDays")} value={f.fMinDays || t("none")} tip={TIPS.minDays} />
            <Stat label={t("daysToPayout")} value={`${f.daysToPayout} ${t("days")}`} tip={TIPS.daysCalc} sub={t("calculated")} />
          </div>
          <BestPlan
            tone="orange"
            target={f.fundTarget}
            days={f.daysToPayout}
            endValue={f.reqBalMax}
            endLabel={t("fundedTarget")}
          />
          {f.fundScalingFactor < 1 && (
            <ScalingDetail
              factor={f.fundScalingFactor}
              tiers={migrateScalingTiers(f, "sf")}
              maxNQ={f.maxNQ}
            />
          )}
        </Section>

        <Section
          title={t("payoutRules")}
          open={sections.pay}
          onToggle={() => toggle("pay")}
          accent="blue"
          icon={Layers}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Stat label={t("buffer")} value={f.buffer ? money(f.buffer) : t("none")} tip={TIPS.buffer} />
            <Stat label={t("profitSplit")} value={pct(f.split)} tip={TIPS.split} />
            <Stat label={t("withdrawalPct")} value={pct(f.withdrawalPct != null ? f.withdrawalPct : 1)} tip={TIPS.withdrawalPct} />
            <Stat label={t("minNetPayout")} value={money(f.minNetPayout)} />
            <Stat label={t("maxNetPayout")} value={money(f.maxNetPayout)} />
            <Stat label={t("reqBalMin")} value={money(f.reqBalMin)} tip={TIPS.reqBalance} />
            <Stat label={t("reqBalMax")} value={money(f.reqBalMax)} tip={TIPS.reqBalance} />
          </div>
          {f.payoutTiers && f.payoutTiers.length > 0 && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                <Layers size={11} strokeWidth={2.5} aria-hidden="true" />
                {t("payoutTiers")}
              </div>
              <div className="space-y-1">
                {f.payoutTiers.map((pt, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-slate-600 dark:text-slate-400">
                    <span className="inline-flex h-4 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                      #{i + 1}
                    </span>
                    <span className="tabular-nums">
                      min <span className="font-semibold text-slate-800 dark:text-slate-200">{money(pt.min || 0)}</span>
                    </span>
                    <span className="tabular-nums">
                      max{" "}
                      {pt.max != null ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{money(pt.max)}</span>
                      ) : (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">unlimited</span>
                      )}
                    </span>
                    {pt.max != null && f.split && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        (net: {money((pt.max || 0) * f.split)})
                      </span>
                    )}
                  </div>
                ))}
                {f.payoutTiers.length > 1 && (
                  <div className="pt-1 text-[10.5px] text-slate-400 dark:text-slate-500">
                    #{f.payoutTiers.length + 1}+ uses #{f.payoutTiers.length} limits
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section
          title={t("financialsRoi")}
          open={sections.fin}
          onToggle={() => toggle("fin")}
          accent="emerald"
          icon={TrendingUp}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Stat label={t("totalCost")} value={money(f.totalCost)} tip={TIPS.totalCost} />
            <Stat label={t("totalDays")} value={`${f.totalDays} ${t("days")}`} tip={TIPS.totalDays} />
            <Stat label="Max NQ" value={f.maxNQ || "—"} tip={TIPS.maxNQ} />
            <Stat
              label={t("minNetProfit")}
              value={
                <span className={f.minNetProfit < 0 ? "text-red-600 dark:text-red-400" : ""}>
                  {money(f.minNetProfit)}
                </span>
              }
              tip={TIPS.netProfit}
              sub={f.minNetProfit < 0 ? t("lossOnMinPayout") : f.minNetProfit === 0 ? t("breakeven") : null}
            />
            <Stat
              label={t("maxNetProfit")}
              value={
                <span className={f.maxNetProfit < 0 ? "text-red-600 dark:text-red-400" : ""}>
                  {money(f.maxNetProfit)}
                </span>
              }
              tip={TIPS.netProfit}
              sub={f.maxNetProfit < 0 ? t("lossEvenAtMax") : null}
            />
            <Stat label={t("maxRoi")} value={pct(f.maxRoi)} tip={TIPS.roi} />
          </div>
        </Section>

        {f.notes && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Info size={11} strokeWidth={2.5} aria-hidden="true" />
              {t("notes")}
            </div>
            <div
              className="rich-notes text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: renderRichNotes(f.notes) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tiny helper: meta strip pill ──
function MetaStat({ label, value, valueClass = "" }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-slate-400 dark:text-slate-500">{label}:</span>
      <span className={"font-semibold tabular-nums text-slate-800 dark:text-slate-200 " + valueClass}>{value}</span>
    </span>
  );
}

// ── "Best plan" callout used in challenge + funded sections ──
const BEST_PLAN_TONES = {
  amber:  "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300",
  orange: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700/60 dark:bg-orange-950/30 dark:text-orange-300",
};
const BEST_PLAN_DAY_TONES = {
  amber:  "bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:ring-amber-800",
  orange: "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:ring-orange-800",
};
function BestPlan({ tone, target, days, endValue, endLabel }) {
  return (
    <div className={"mt-3 rounded-xl border p-3 " + BEST_PLAN_TONES[tone]}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide">
          <Target size={11} strokeWidth={2.5} aria-hidden="true" />
          {t("bestPlan")}
          <Tip text={TIPS.dailyTarget} />
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          {days} {t("days")}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-bold tabular-nums">{money(target)}</span>
        <span className="text-[12px] font-medium opacity-70">{t("perDay")}</span>
      </div>
      <div className="mb-2 text-[11.5px] text-slate-500 dark:text-slate-400 tabular-nums">
        {money(target)} × {days} {t("days")} = {money(endValue)} {endLabel}
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: days }, (_, i) => (
          <div
            key={i}
            className={"rounded-md px-2 py-1 text-center " + BEST_PLAN_DAY_TONES[tone]}
            style={{ minWidth: "3.5rem" }}
          >
            <div className="text-[9.5px] opacity-70">D{i + 1}</div>
            <div className="text-[11.5px] font-bold tabular-nums">{money(target)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scaling detail sub-card ──
function ScalingDetail({ factor, tiers, maxNQ }) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
        <Layers size={11} strokeWidth={2.5} aria-hidden="true" />
        {t("scalingFactor")}
        <Tip text={TIPS.scalingFactor} />
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
          {pct(factor)}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">— {t("contractsLimited")}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        {tiers.map((ti, i) => {
          const prev = i > 0 ? tiers[i - 1].upTo : 0;
          const isLast = i === tiers.length - 1;
          return (
            <span key={i}>
              {i > 0 ? " → " : ""}${prev.toLocaleString()}–
              {isLast ? `$${(ti.upTo || 0).toLocaleString()}+` : `$${(ti.upTo || 0).toLocaleString()}`}: {ti.contracts}
            </span>
          );
        })}
        {tiers.length > 0 && ` → above: ${maxNQ} max`}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAYOUT TIER EDITOR
// ═══════════════════════════════════════════════════════════
// Compact inline tier-editor input
const TIER_INPUT_CLS =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-[12.5px] tabular-nums text-slate-900 shadow-sm " +
  "transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function PayoutTierEditor({ tiers, onChange }) {
  const rows = tiers && tiers.length > 0 ? tiers : [];

  const addTier = () => {
    // Copy limits from last tier as defaults
    const last = rows.length > 0 ? rows[rows.length - 1] : { min: 500, max: 1500 };
    onChange([...rows, { min: last.min || 500, max: last.max || null }]);
  };

  const updateTier = (idx, key, val) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [key]: val } : r);
    onChange(next);
  };

  const removeTier = (idx) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1.5">
      {rows.map((tier, i) => {
        const isLast = i === rows.length - 1;
        return (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <Badge variant="info" size="sm" className="shrink-0">#{i + 1}</Badge>
            <div className="flex items-center gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("min")}</span>
              <span className="text-[12px] text-slate-400 dark:text-slate-500">$</span>
              <input
                type="number" step="any"
                className={TIER_INPUT_CLS + " w-20"}
                value={tier.min == null ? "" : tier.min}
                onChange={e => updateTier(i, "min", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0"
                aria-label={`Tier ${i + 1} minimum`}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("max")}</span>
              <span className="text-[12px] text-slate-400 dark:text-slate-500">$</span>
              <input
                type="number" step="any"
                className={TIER_INPUT_CLS + " w-20"}
                value={tier.max == null ? "" : tier.max}
                onChange={e => updateTier(i, "max", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={isLast ? "no limit" : t("max")}
                aria-label={`Tier ${i + 1} maximum`}
              />
              {isLast && tier.max == null && (
                <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span aria-hidden="true">∞</span> {t("unlimited")}
                </span>
              )}
            </div>
            <div className="ml-auto">
              <IconButton
                icon={Trash2}
                label={`Remove tier ${i + 1}`}
                size="icon-sm"
                variant="ghost-danger"
                onClick={() => removeTier(i)}
              />
            </div>
          </div>
        );
      })}
      <Button
        size="xs"
        variant="secondary"
        leftIcon={<Plus size={11} strokeWidth={2.5} />}
        className="!border-blue-200 !text-blue-700 hover:!border-blue-300 hover:!bg-blue-50 dark:!border-blue-900 dark:!text-blue-400 dark:hover:!bg-blue-950/40"
        onClick={addTier}
      >
        {t("addPayoutTier")}
      </Button>
      {rows.length > 1 && (
        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
          Payout #{rows.length + 1}+ will use Payout #{rows.length} limits{rows[rows.length - 1]?.max == null ? " (unlimited max)" : ""}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCALING TIER EDITOR
// ═══════════════════════════════════════════════════════════
function ScalingTierEditor({ tiers, onChange, maxContracts }) {
  const rows = tiers && tiers.length > 0 ? tiers : [];

  const addTier = () => {
    const lastUpTo = rows.length > 0 ? (rows[rows.length - 1].upTo || 0) : 0;
    onChange([...rows, { upTo: lastUpTo + 1000, contracts: maxContracts || 1 }]);
  };

  const updateTier = (idx, key, val) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [key]: val } : r);
    onChange(next);
  };

  const removeTier = (idx) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1.5">
      {rows.map((tier, i) => {
        const prevUpTo = i > 0 ? rows[i - 1].upTo : 0;
        const isLast = i === rows.length - 1;
        return (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <Badge variant="neutral" size="sm" className="shrink-0">{i + 1}</Badge>
            <div className="flex items-center gap-1 text-[12px]">
              <span className="tabular-nums text-slate-500 dark:text-slate-400">${prevUpTo.toLocaleString()}</span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">–</span>
              <span className="text-slate-400 dark:text-slate-500">$</span>
              <input
                type="number" step="any"
                className={TIER_INPUT_CLS + " w-24"}
                value={tier.upTo == null ? "" : tier.upTo}
                onChange={e => updateTier(i, "upTo", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={isLast ? "& above" : "up to"}
                aria-label={`Tier ${i + 1} up-to threshold`}
              />
            </div>
            <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">→</span>
            <div className="flex items-center gap-1">
              <input
                type="number" step="1" min="1"
                className={TIER_INPUT_CLS + " w-14"}
                value={tier.contracts == null ? "" : tier.contracts}
                onChange={e => updateTier(i, "contracts", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="#"
                aria-label={`Tier ${i + 1} contract count`}
              />
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400">contracts</span>
            </div>
            <div className="ml-auto">
              <IconButton
                icon={Trash2}
                label={`Remove tier ${i + 1}`}
                size="icon-sm"
                variant="ghost-danger"
                onClick={() => removeTier(i)}
              />
            </div>
          </div>
        );
      })}
      <Button
        size="xs"
        variant="secondary"
        leftIcon={<Plus size={11} strokeWidth={2.5} />}
        className="!border-blue-200 !text-blue-700 hover:!border-blue-300 hover:!bg-blue-50 dark:!border-blue-900 dark:!text-blue-400 dark:hover:!bg-blue-950/40"
        onClick={addTier}
      >
        {t("addTier")}
      </Button>
      {rows.length > 0 && (
        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums">
          Above ${(rows[rows.length - 1]?.upTo || 0).toLocaleString()}: {maxContracts || "?"} contracts (max NQ from Basic Info)
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FIRM FORM (DRAWER)
// ═══════════════════════════════════════════════════════════
function FirmForm({ initial, onSave, onCancel }) {
  const empty = { name:"", model:"", cost:null, pt:null, dll:null, mll:null, consistency:null, minDays:null, minProfit:null, activation:null, fDll:null, fMll:null, fConsistency:null, fMinDays:null, fMinProfit:null, buffer:null, split:null, maxNQ:null, notes:"", scalingChal: [], scalingFund: [], payoutTiers: [] };
  const [form, setForm] = useState(() => {
    if (!initial) return { ...empty, withdrawalPct: 100 };
    return {
      ...initial,
      consistency: initial.consistency != null ? Math.round(initial.consistency * 100) : null,
      fConsistency: initial.fConsistency != null ? Math.round(initial.fConsistency * 100) : null,
      split: initial.split != null ? Math.round(initial.split * 100) : null,
      withdrawalPct: initial.withdrawalPct != null ? Math.round(initial.withdrawalPct * 100) : 100,
      scalingChal: migrateScalingTiers(initial, "sc"),
      scalingFund: migrateScalingTiers(initial, "sf"),
      payoutTiers: migratePayoutTiers(initial),
    };
  });
  const [sections, setSections] = useState({ basic: true });
  const toggle = k => setSections(s => ({ ...s, [k]: !s[k] }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name) { alert(t("alertNameRequired")); return; }
    if (!form.instant && (!form.pt || !form.mll)) {
      alert(t("alertChallengeRequired"));
      return;
    }
    const out = {
      ...form,
      id: initial?.id || nextId++,
      consistency: form.consistency != null ? form.consistency / 100 : null,
      fConsistency: form.fConsistency != null ? form.fConsistency / 100 : null,
      split: form.split != null ? form.split / 100 : null,
      withdrawalPct: form.withdrawalPct != null ? form.withdrawalPct / 100 : 1,
      cost: form.cost || 0,
      activation: form.activation || 0,
      buffer: form.buffer || 0,
      mll: form.mll || 0,
      fMll: form.fMll || 0,
      payoutTiers: form.payoutTiers || [],
    };
    // Remove legacy fields since payoutTiers is the source of truth now
    delete out.minPayout;
    delete out.maxPayout;
    onSave(out);
  };

  // Escape to close + body scroll lock (matches Modal primitive behavior)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel?.(); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onCancel]);

  const selectCls =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900 shadow-sm " +
    "transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="firm-form-title" className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      {/* Panel — right-side drawer */}
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-slate-200 bg-white shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
            >
              <Building2 size={15} strokeWidth={2.25} />
            </span>
            <h2 id="firm-form-title" className="truncate text-[16px] font-semibold text-slate-900 dark:text-slate-100">
              {initial ? t("editFirm") : t("addNewFirm")}
            </h2>
          </div>
          <IconButton icon={X} label="Close" size="icon-sm" variant="ghost" onClick={onCancel} />
        </header>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Basic Info */}
          <section className="space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Info size={10} strokeWidth={2.5} />
              </span>
              {t("basicInfo")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("firmName")} value={form.name} onChange={v => set("name", v)} type="text" placeholder="e.g. Apex Trader Funding" />
              <Field label={t("modelPlan")} value={form.model} onChange={v => set("model", v)} type="text" placeholder="e.g. $50K EOD" />
              <Field label={t("evalCost")} value={form.cost} onChange={v => set("cost", v)} prefix="$" tip={TIPS.cost} placeholder="0" />
              <div>
                <label className={FIELD_LABEL_CLS}>{t("resetCost")}<Tip text={TIPS.resetCost} /></label>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[13px] text-slate-400 dark:text-slate-500">$</span>
                  <input
                    type="number" step="any"
                    className={FIELD_INPUT_CLS}
                    value={form.resetCost === "na" ? "" : (form.resetCost == null ? "" : form.resetCost)}
                    onChange={e => set("resetCost", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="same as eval"
                    disabled={form.resetCost === "na"}
                  />
                  <button
                    type="button"
                    onClick={() => set("resetCost", form.resetCost === "na" ? null : "na")}
                    aria-pressed={form.resetCost === "na"}
                    title={form.resetCost === "na" ? "Resets not available — click to enable" : "Mark as no resets available"}
                    className={
                      "shrink-0 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                      (form.resetCost === "na"
                        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800")
                    }
                  >
                    N/A
                  </button>
                </div>
              </div>
              <Field label={t("maxNqContracts")} value={form.maxNQ} onChange={v => set("maxNQ", v)} tip={TIPS.maxNQ} placeholder="—" />
            </div>
            <label className="mt-1 flex cursor-pointer select-none items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!form.instant} onChange={e => set("instant", e.target.checked)} />
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{t("instantFunded")}</span>
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400">{t("noChallenge")}</span>
            </label>
          </section>

          {!form.instant && (
            <Section title={t("challengeRules")} open={sections.chal} onToggle={() => toggle("chal")} accent="amber" icon={Target}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("profitTargetReq")} value={form.pt} onChange={v => set("pt", v)} prefix="$" tip={TIPS.pt} />
                <Field label={t("maxLossLimitReq")} value={form.mll} onChange={v => set("mll", v)} prefix="$" tip={TIPS.mll} />
                <div>
                  <label className={FIELD_LABEL_CLS}>{t("mllDrawdownType")} <Tip text={TIPS.mllType} /></label>
                  <select className={selectCls} value={form.mllType || "static"} onChange={e => set("mllType", e.target.value)}>
                    <option value="static">{t("ddStatic")}</option>
                    <option value="eod">{t("ddTrailingEod")}</option>
                    <option value="intraday">{t("ddTrailingIntraday")}</option>
                  </select>
                </div>
                <Field label={t("dailyLossLimit")} value={form.dll} onChange={v => set("dll", v)} prefix="$" tip={TIPS.dll} placeholder={t("emptyNone")} />
                <Field label={t("consistency")} value={form.consistency} onChange={v => set("consistency", v)} suffix="%" tip={TIPS.consistency} placeholder={t("emptyNone")} />
                <Field label={t("minProfitDays")} value={form.minDays} onChange={v => set("minDays", v)} tip={TIPS.minDays} placeholder={t("emptyNone")} />
                <Field label={t("minDailyProfit")} value={form.minProfit} onChange={v => set("minProfit", v)} prefix="$" tip={TIPS.minProfit} placeholder={t("emptyNone")} />
              </div>
            </Section>
          )}

          <Section title={t("fundedRules")} open={sections.fund} onToggle={() => toggle("fund")} accent="orange" icon={Briefcase}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("activationFee")} value={form.activation} onChange={v => set("activation", v)} prefix="$" tip={TIPS.activation} placeholder="0" />
              <Field label={t("maxLossLimit")} value={form.fMll} onChange={v => set("fMll", v)} prefix="$" tip={TIPS.mll} />
              <div>
                <label className={FIELD_LABEL_CLS}>{t("mllDrawdownType")} <Tip text={TIPS.mllType} /></label>
                <select className={selectCls} value={form.fMllType || "static"} onChange={e => set("fMllType", e.target.value)}>
                  <option value="static">{t("ddStatic")}</option>
                  <option value="eod">{t("ddTrailingEod")}</option>
                  <option value="intraday">{t("ddTrailingIntraday")}</option>
                </select>
              </div>
              <Field label={t("dailyLossLimit")} value={form.fDll} onChange={v => set("fDll", v)} prefix="$" tip={TIPS.dll} placeholder={t("emptyNone")} />
              <Field label={t("consistency")} value={form.fConsistency} onChange={v => set("fConsistency", v)} suffix="%" tip={TIPS.consistency} placeholder={t("emptyNone")} />
              <Field label={t("minProfitDays")} value={form.fMinDays} onChange={v => set("fMinDays", v)} tip={TIPS.minDays} placeholder={t("emptyNone")} />
              <Field label={t("minDailyProfit")} value={form.fMinProfit} onChange={v => set("fMinProfit", v)} prefix="$" tip={TIPS.minProfit} placeholder={t("emptyNone")} />
            </div>
          </Section>

          {!form.instant && (
            <Section title={t("challengeScaling")} open={sections.scChal} onToggle={() => toggle("scChal")} accent="amber" icon={Layers}>
              <p className="mb-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                {t("scalingDesc")} <Tip text={TIPS.scalingPlan} />
              </p>
              <ScalingTierEditor tiers={form.scalingChal || []} onChange={v => set("scalingChal", v)} maxContracts={form.maxNQ} />
            </Section>
          )}

          <Section title={t("fundedScaling")} open={sections.scFund} onToggle={() => toggle("scFund")} accent="orange" icon={Layers}>
            <p className="mb-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              {t("scalingFundDesc")} <Tip text={TIPS.scalingPlan} />
            </p>
            <ScalingTierEditor tiers={form.scalingFund || []} onChange={v => set("scalingFund", v)} maxContracts={form.maxNQ} />
          </Section>

          <Section title={t("payoutRules")} open={sections.pay} onToggle={() => toggle("pay")} accent="blue" icon={Award}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("buffer")} value={form.buffer} onChange={v => set("buffer", v)} prefix="$" tip={TIPS.buffer} placeholder="0" />
              <Field label={t("profitSplit")} value={form.split} onChange={v => set("split", v)} suffix="%" tip={TIPS.split} placeholder="e.g. 90" />
              <Field label={t("withdrawalPct")} value={form.withdrawalPct} onChange={v => set("withdrawalPct", v)} suffix="%" tip={TIPS.withdrawalPct} placeholder="100 (default)" />
            </div>
            <div className="mt-3">
              <label className={FIELD_LABEL_CLS}>{t("payoutTiers")} <Tip text={TIPS.payoutTiers} /></label>
              <PayoutTierEditor tiers={form.payoutTiers || []} onChange={v => set("payoutTiers", v)} />
            </div>
          </Section>

          <Section title={t("notes")} open={sections.notes} onToggle={() => toggle("notes")} accent="slate" icon={BookOpen}>
            <RichTextEditor value={form.notes} onChange={v => set("notes", v)} />
          </Section>
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <Button variant="ghost" size="md" onClick={onCancel}>{t("cancel")}</Button>
          <Button variant="primary" size="md" onClick={handleSave}>
            {initial ? t("updateFirm") : t("addFirm")}
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════
// METRICS GUIDE PAGE — full documentation of every metric
// ═══════════════════════════════════════════════════════════
function MetricBlock({ titleKey, formulaKey, inputsKey, descKey, exampleKey }) {
  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition-shadow duration-150 hover:shadow-soft-md dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
        {t(titleKey)}
      </h3>

      {formulaKey && (
        <MetricSection label={t("mgFormula")} tone="indigo" icon={Calculator}>
          <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11.5px] leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
            {t(formulaKey)}
          </pre>
        </MetricSection>
      )}

      {inputsKey && (
        <MetricSection label={t("mgInputs")} tone="blue" icon={Info}>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
            {t(inputsKey)}
          </p>
        </MetricSection>
      )}

      <MetricSection label={t("mgDescription")} tone="emerald" icon={BookOpen}>
        <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
          {t(descKey)}
        </p>
      </MetricSection>

      {exampleKey && (
        <MetricSection label={t("mgExample")} tone="amber" icon={Target}>
          <pre className="whitespace-pre-wrap rounded-md border border-amber-200 bg-amber-50/60 p-3 font-mono text-[11.5px] leading-relaxed text-slate-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-slate-200">
            {t(exampleKey)}
          </pre>
        </MetricSection>
      )}
    </article>
  );
}

// ── Sub-section inside MetricBlock (formula / inputs / description / example) ──
const METRIC_SECTION_TONES = {
  indigo:  "text-indigo-600 dark:text-indigo-400",
  blue:    "text-blue-600 dark:text-blue-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber:   "text-amber-600 dark:text-amber-400",
};
function MetricSection({ label, tone, icon: Icon, children }) {
  const cls = METRIC_SECTION_TONES[tone] || METRIC_SECTION_TONES.emerald;
  return (
    <div>
      <span className={"inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider " + cls}>
        {Icon && <Icon size={11} strokeWidth={2.5} aria-hidden="true" />}
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ── Guide section header ──
const GUIDE_SECTION_ICONS = {
  comparison: { Icon: BarChart3,  chip: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400",    border: "border-indigo-200 dark:border-indigo-900" },
  financial:  { Icon: TrendingUp, chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-900" },
  live:       { Icon: Activity,   chip: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",             border: "border-blue-200 dark:border-blue-900" },
  trading:    { Icon: Target,     chip: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",         border: "border-amber-200 dark:border-amber-900" },
};
function GuideSection({ variant, title, children }) {
  const { Icon, chip, border } = GUIDE_SECTION_ICONS[variant] || GUIDE_SECTION_ICONS.comparison;
  return (
    <section>
      <div className={"mb-4 flex items-center gap-2.5 border-b-2 pb-2 " + border}>
        <span
          aria-hidden="true"
          className={"flex h-7 w-7 items-center justify-center rounded-md " + chip}
        >
          <Icon size={14} strokeWidth={2.25} />
        </span>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function MetricsGuide() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Title & intro */}
      <header className="text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-soft">
          <BookOpen size={18} strokeWidth={2.25} className="text-white" aria-hidden="true" />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {t("mgTitle")}
        </h1>
        <p className="mx-auto mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t("mgIntro")}
        </p>
      </header>

      <GuideSection variant="comparison" title={t("mgSectionComparison")}>
        <MetricBlock titleKey="mgEffMllTitle" formulaKey="mgEffMllFormula" inputsKey="mgEffMllInputs" descKey="mgEffMllDesc" exampleKey="mgEffMllExample" />
        <MetricBlock titleKey="mgRoomScoreTitle" formulaKey="mgRoomScoreFormula" inputsKey="mgRoomScoreInputs" descKey="mgRoomScoreDesc" exampleKey="mgRoomScoreExample" />
        <MetricBlock titleKey="mgDaysFactorTitle" formulaKey="mgDaysFactorFormula" inputsKey="mgDaysFactorInputs" descKey="mgDaysFactorDesc" exampleKey="mgDaysFactorExample" />
        <MetricBlock titleKey="mgScalingFactorTitle" formulaKey="mgScalingFactorFormula" inputsKey="mgScalingFactorInputs" descKey="mgScalingFactorDesc" exampleKey="mgScalingFactorExample" />
        <MetricBlock titleKey="mgEaseToPassTitle" formulaKey="mgEaseToPassFormula" inputsKey="mgEaseToPassInputs" descKey="mgEaseToPassDesc" exampleKey="mgEaseToPassExample" />
        <MetricBlock titleKey="mgEaseToGetPaidTitle" formulaKey="mgEaseToGetPaidFormula" inputsKey="mgEaseToGetPaidInputs" descKey="mgEaseToGetPaidDesc" exampleKey="mgEaseToGetPaidExample" />
        <MetricBlock titleKey="mgOverallEaseTitle" formulaKey="mgOverallEaseFormula" inputsKey="mgOverallEaseInputs" descKey="mgOverallEaseDesc" exampleKey="mgOverallEaseExample" />
        <MetricBlock titleKey="mgDaysTitle" formulaKey="mgDaysFormula" inputsKey="mgDaysInputs" descKey="mgDaysDesc" exampleKey="mgDaysExample" />
      </GuideSection>

      <GuideSection variant="financial" title={t("mgSectionFinancial")}>
        <MetricBlock titleKey="mgTotalCostTitle" formulaKey="mgTotalCostFormula" descKey="mgTotalCostDesc" />
        <MetricBlock titleKey="mgNetProfitTitle" formulaKey="mgNetProfitFormula" descKey="mgNetProfitDesc" exampleKey="mgNetProfitExample" />
        <MetricBlock titleKey="mgRoiTitle" formulaKey="mgRoiFormula" descKey="mgRoiDesc" exampleKey="mgRoiExample" />
        <MetricBlock titleKey="mgDailyRateTitle" formulaKey="mgDailyRateFormula" descKey="mgDailyRateDesc" exampleKey="mgDailyRateExample" />
        <MetricBlock titleKey="mgResetsTitle" formulaKey="mgResetsFormula" inputsKey="mgResetsInputs" descKey="mgResetsDesc" exampleKey="mgResetsExample" />
        <MetricBlock titleKey="mgReqBalTitle" formulaKey="mgReqBalFormula" descKey="mgReqBalDesc" />
      </GuideSection>

      <GuideSection variant="live" title={t("mgSectionLive")}>
        <MetricBlock titleKey="mgConsistencyTitle" formulaKey="mgConsistencyFormula" inputsKey="mgConsistencyInputs" descKey="mgConsistencyDesc" exampleKey="mgConsistencyExample" />
        <MetricBlock titleKey="mgMaxSafeTitle" formulaKey="mgMaxSafeFormula" inputsKey="mgMaxSafeInputs" descKey="mgMaxSafeDesc" exampleKey="mgMaxSafeExample" />
        <MetricBlock titleKey="mgDrawdownTitle" formulaKey="mgDrawdownFormula" descKey="mgDrawdownDesc" exampleKey="mgDrawdownExample" />
        <MetricBlock titleKey="mgAllRulesTitle" formulaKey="mgAllRulesFormula" descKey="mgAllRulesDesc" />
        <MetricBlock titleKey="mgLiveEaseTitle" formulaKey="mgLiveEaseFormula" descKey="mgLiveEaseDesc" />
        <MetricBlock titleKey="mgLiveScalingTitle" formulaKey="mgLiveScalingFormula" descKey="mgLiveScalingDesc" />
      </GuideSection>

      <GuideSection variant="trading" title={t("mgSectionTrading")}>
        <MetricBlock titleKey="mgIdealTargetTitle" formulaKey="mgIdealTargetFormula" inputsKey="mgIdealTargetInputs" descKey="mgIdealTargetDesc" exampleKey="mgIdealTargetExample" />
      </GuideSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOW IT WORKS PANEL
// ═══════════════════════════════════════════════════════════
function HowItWorks({ open, onToggle }) {
  return (
    <div
      className={
        "overflow-hidden rounded-xl border bg-white shadow-soft transition-colors duration-150 " +
        "border-slate-200 dark:border-slate-800 dark:bg-slate-900"
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="how-it-works-panel"
        className={
          "group flex w-full items-center justify-between gap-3 px-4 py-3 text-left " +
          "transition-colors duration-150 hover:bg-slate-50 focus:outline-none " +
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 " +
          "dark:hover:bg-slate-800/40"
        }
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
          >
            <Calculator size={13} strokeWidth={2.25} />
          </span>
          <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            {t("howCalculated")}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.25}
          aria-hidden="true"
          className={
            "shrink-0 text-slate-400 transition-transform duration-200 ease-out " +
            "dark:text-slate-500 " + (open ? "rotate-180" : "rotate-0")
          }
        />
      </button>

      <div
        id="how-it-works-panel"
        className={
          "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none " +
          (open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
            <div className="grid gap-4 md:grid-cols-2">
              <HiwSection title={t("easeToPassTitle")} tone="emerald">
                <HiwRow label="Room Score">
                  If DLL exists: <code className="hiw-code">(DLL/PT) × (1 + log₂(MLL/DLL) × 0.25)</code>.
                  If no DLL: <code className="hiw-code">MLL/PT</code>. Higher DLL or no DLL = more room per session.
                </HiwRow>
                <HiwRow label="Days Factor">
                  <code className="hiw-code">(1/eff_days)^0.3</code>, where
                  <code className="hiw-code ml-1">eff_days = MAX(Min days, ⌈1/Consistency⌉)</code>. Fewer days = less penalty.
                </HiwRow>
                <HiwRow label="Scaling Factor">
                  Weighted avg contracts ÷ max contracts. 100% if no scaling plan.
                  Final: <code className="hiw-code">Room × Days × Scaling</code>.
                </HiwRow>
              </HiwSection>

              <HiwSection title={t("easeToGetPaidTitle")} tone="blue">
                <HiwRow>
                  Same formula, but uses funded DLL/MLL/Consistency/Days.
                  Target = <code className="hiw-code">MAX(Buffer + Max Payout, Max Payout ÷ Withdrawal %)</code>.
                </HiwRow>
                <HiwRow label="Buffer model (100% withdrawal)">
                  target = <code className="hiw-code">Buffer + Max Payout</code>.
                </HiwRow>
                <HiwRow label="Profit-split (e.g. 50%)">
                  target = <code className="hiw-code">MaxPay ÷ 0.5 = 2× MaxPay</code>. The MAX picks whichever is stricter.
                </HiwRow>
              </HiwSection>

              <HiwSection title={t("overallEaseTitle")} tone="amber">
                <HiwRow>
                  Geometric mean: <code className="hiw-code">√(Pass × Paid)</code>. Unlike a regular average,
                  this penalizes imbalance — a firm easy to pass but hard to get paid (or vice versa) scores
                  lower than a balanced one.
                </HiwRow>
              </HiwSection>

              <HiwSection title={t("daysFormula")} tone="slate">
                <HiwRow>
                  <code className="hiw-code">MAX(Min profitable days, ⌈1/Consistency⌉)</code>. Stricter of explicit
                  minimum days or consistency-implied minimum. E.g. 40% consistency → need
                  <code className="hiw-code ml-1">⌈1/0.4⌉ = 3</code> days minimum.
                </HiwRow>
              </HiwSection>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("tunableParams")}
              </div>
              <div className="grid gap-2 text-[12.5px] leading-snug text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                <div>
                  <code className="hiw-code">0.25</code> — MLL runway bonus weight. Higher = MLL matters more when DLL exists.
                </div>
                <div>
                  <code className="hiw-code">0.3</code> — Days exponent. Higher = more days penalty. At 0.3, 10 days halves the score vs 1 day.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable section styles for HowItWorks
const HIW_TONES = {
  emerald: "border-l-2 border-emerald-400 bg-emerald-50/40 dark:border-emerald-500/80 dark:bg-emerald-950/20",
  blue:    "border-l-2 border-blue-400 bg-blue-50/40 dark:border-blue-500/80 dark:bg-blue-950/20",
  amber:   "border-l-2 border-amber-400 bg-amber-50/40 dark:border-amber-500/80 dark:bg-amber-950/20",
  slate:   "border-l-2 border-slate-300 bg-slate-50/60 dark:border-slate-600 dark:bg-slate-800/40",
};

function HiwSection({ title, tone = "slate", children }) {
  return (
    <div className={"rounded-r-md px-3 py-2.5 " + (HIW_TONES[tone] || HIW_TONES.slate)}>
      <h4 className="mb-1.5 text-[12px] font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function HiwRow({ label, children }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
      {label && <strong className="font-semibold text-slate-800 dark:text-slate-200">{label}: </strong>}
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARISON TABLE
// ═══════════════════════════════════════════════════════════
const getTableCols = () => [
  { key: "overallEase", label: t("overallEaseCol"), fmt: pct, sort: true, desc: true, primary: true },
  { key: "easeToPass", label: t("easeToPassCol"), fmt: pct, sort: true, desc: true },
  { key: "easeToGetPaid", label: t("easeToGetPaidCol"), fmt: pct, sort: true, desc: true },
  { key: "totalCost", label: t("totalCostCol"), fmt: money, sort: true, desc: false },
  { key: "maxNetProfit", label: t("maxNetProfitCol"), fmt: money, sort: true, desc: true },
  { key: "maxRoi", label: t("maxRoiCol"), fmt: pct, sort: true, desc: true },
  { key: "dailyProfitRate", label: t("dailyProfitRateCol"), fmt: v => v != null ? `${money(v)}/d` : "—", sort: true, desc: true },
  { key: "resetsToBreakeven", label: t("resetsBECol"), fmt: (v, f) => f && f.noResets ? t("na") : v != null ? `${v}×` : "—", sort: true, desc: true },
  { key: "totalDays", label: t("daysToPayoutCol"), fmt: (v, f) => f && f.isInstant ? `${f.daysToPayout}d` : v != null ? `${v}d` : "—", sort: true, desc: false },
];

// ── Rank badge (replaces emoji medals with a polished pill) ──
const RANK_STYLES = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-400/50",
  2: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-sm ring-1 ring-slate-400/50 dark:from-slate-300 dark:to-slate-500 dark:text-slate-900",
  3: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950 shadow-sm ring-1 ring-orange-400/50",
};
function RankBadge({ rank }) {
  const top = rank <= 3;
  const cls = top
    ? RANK_STYLES[rank]
    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={
        "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1 " +
        "text-[11px] font-bold tabular-nums " + cls
      }
    >
      {rank}
    </span>
  );
}

// ── Row tone — subtle tier coloring (bg + left accent) ──
const ROW_TONES = {
  top: {
    row: "bg-emerald-50/60 dark:bg-emerald-950/20",
    accent: "bg-emerald-400 dark:bg-emerald-500",
  },
  green: {
    row: "bg-emerald-50/40 dark:bg-emerald-950/10",
    accent: "bg-emerald-300 dark:bg-emerald-600/60",
  },
  amber: {
    row: "bg-amber-50/40 dark:bg-amber-950/10",
    accent: "bg-amber-300 dark:bg-amber-600/60",
  },
  red: {
    row: "bg-red-50/40 dark:bg-red-950/10",
    accent: "bg-red-300 dark:bg-red-600/60",
  },
  neutral: {
    row: "bg-white dark:bg-slate-900",
    accent: "bg-slate-200 dark:bg-slate-800",
  },
};
const rowTone = (rank, ease) => {
  if (ease == null) return "neutral";
  if (rank <= 3 && ease >= 0.45) return "top";
  if (ease >= 0.45) return "green";
  if (ease >= 0.25) return "amber";
  return "red";
};

// ── Ease cell color (text-only) ──
const easeTextClass = (val) => {
  if (val == null) return "text-slate-400 dark:text-slate-500";
  if (val >= 0.45) return "text-emerald-700 dark:text-emerald-400 font-semibold";
  if (val >= 0.25) return "text-amber-700 dark:text-amber-400 font-semibold";
  return "text-red-700 dark:text-red-400 font-semibold";
};

function ComparisonTable({ firms, sortKey, onSort, onFirmClick }) {
  const cols = getTableCols();

  if (firms.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={t("noFirmsYet")}
        description={t("clickAddFirm")}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              <th scope="col" className="w-10 px-2 py-2.5 text-center">#</th>
              <th scope="col" className="min-w-[160px] px-3 py-2.5 text-left">Firm</th>
              {cols.map(col => {
                const active = sortKey === col.key;
                const SortIcon = col.desc ? ArrowDown : ArrowUp;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (col.desc ? "descending" : "ascending") : "none"}
                    className={
                      "whitespace-pre-line px-2 py-2.5 text-center leading-tight " +
                      (col.sort
                        ? "cursor-pointer select-none transition-colors duration-100 hover:bg-slate-100 dark:hover:bg-slate-800/60 "
                        : "") +
                      (active ? "text-blue-700 dark:text-blue-400" : "")
                    }
                    onClick={() => col.sort && onSort(col.key)}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      <span>{col.label}</span>
                      {col.sort && (
                        <SortIcon
                          size={11}
                          strokeWidth={2.5}
                          aria-hidden="true"
                          className={active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}
                        />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {firms.map((f, i) => {
              const rank = i + 1;
              const tone = ROW_TONES[rowTone(rank, f.overallEase)];
              return (
                <tr
                  key={f.id}
                  className={
                    "group relative transition-colors duration-100 " +
                    tone.row +
                    " hover:bg-blue-50/60 dark:hover:bg-blue-950/30"
                  }
                >
                  <td className="relative px-2 py-2.5 text-center align-middle">
                    {/* Left accent stripe */}
                    <span
                      aria-hidden="true"
                      className={"absolute left-0 top-0 h-full w-[3px] " + tone.accent}
                    />
                    <RankBadge rank={rank} />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      onClick={() => onFirmClick(f.id)}
                      className="group/link inline-flex items-center gap-1 rounded text-left text-[13.5px] font-semibold leading-tight text-blue-700 transition-colors hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <span className="truncate">{f.name}</span>
                      <ExternalLink
                        size={11}
                        strokeWidth={2.25}
                        aria-hidden="true"
                        className="opacity-0 transition-opacity group-hover/link:opacity-70"
                      />
                    </button>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] leading-tight text-slate-500 dark:text-slate-400">
                      <span className="truncate">{f.model}</span>
                      {f.isInstant && (
                        <Badge variant="info" size="sm">
                          INSTANT
                        </Badge>
                      )}
                    </div>
                  </td>
                  {cols.map(col => {
                    const val = f[col.key];
                    const isEase = col.key.includes("ase") || col.key.includes("Ease");

                    let cellCls = "text-slate-700 dark:text-slate-300";
                    if (isEase && val != null) {
                      cellCls = easeTextClass(val);
                    }
                    if (col.key === "maxRoi" && val != null) {
                      cellCls =
                        val >= 5
                          ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                          : val >= 2
                          ? "text-amber-700 dark:text-amber-400 font-semibold"
                          : "text-slate-700 dark:text-slate-300";
                    }
                    if (col.key === "maxNetProfit" && val != null) {
                      cellCls =
                        val < 0
                          ? "text-red-600 dark:text-red-400 font-semibold"
                          : "text-slate-700 dark:text-slate-300";
                    }

                    return (
                      <td
                        key={col.key}
                        className={
                          "px-2 py-2.5 text-center tabular-nums align-middle " +
                          cellCls +
                          (col.primary ? " text-[14px] font-bold" : "")
                        }
                      >
                        {col.fmt(val, f)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT TRACKER
// ═══════════════════════════════════════════════════════════
let nextAccountId = 1;

function calcLiveMetrics(account, firmData) {
  if (!firmData) return {};
  const f = computeAll(firmData);
  const phase = account.phase || "challenge";
  const allEntries = (account.journal || []).slice().sort((a, b) => a.date > b.date ? 1 : -1);
  const payouts = (account.payouts || []).slice().sort((a, b) => a.date > b.date ? 1 : -1);
  const lastPayout = payouts.length > 0 ? payouts[payouts.length - 1] : null;
  const totalPayouts = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  // After a payout, metrics reset: use entries after last payout date, new starting balance
  const effectiveStartBal = lastPayout ? lastPayout.newBalance : (account.startBalance || 50000);
  const entries = lastPayout
    ? allEntries.filter(e => e.date > lastPayout.date)
    : allEntries;
  const startBal = effectiveStartBal;
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const currentBal = lastEntry ? lastEntry.balance : startBal;
  const totalPnl = currentBal - startBal;
  const baseTarget = phase === "challenge" ? (f.pt || 0) : f.reqBalMax;
  const mll = phase === "challenge" ? (f.mll || 0) : (f.fMll || 0);
  const mllType = phase === "challenge" ? (f.mllType || "static") : (f.fMllType || "static");
  const dll = phase === "challenge" ? f.dll : f.fDll;
  const consistency = phase === "challenge" ? f.consistency : f.fConsistency;
  const minDays = phase === "challenge" ? f.minDays : f.fMinDays;
  const scalingFactor = phase === "challenge" ? f.chalScalingFactor : f.fundScalingFactor;
  const minProfit = phase === "challenge" ? (f.minProfit || 0) : (f.fMinProfit || 0);

  // ── Per-entry analysis with running state ──
  let peakBal = startBal;
  let biggestDay = 0;
  let biggestDayDate = null;
  const dailyDetails = []; // per-day rule checks

  entries.forEach((e, idx) => {
    const bal = e.balance;
    const prevBal = idx > 0 ? entries[idx - 1].balance : startBal;
    // Use balance change as the source of truth for daily P&L
    // Fall back to e.pnl only if balance data is missing
    const balDelta = bal != null && prevBal != null ? Math.round((bal - prevBal) * 100) / 100 : null;
    const dayPnl = balDelta != null ? balDelta : (e.pnl || 0);

    // Track peak for trailing DD
    if (bal > peakBal) peakBal = bal;

    // Track biggest profitable day
    if (dayPnl > biggestDay) { biggestDay = dayPnl; biggestDayDate = e.date; }

    // DLL check — daily loss vs daily loss limit
    const dllBreach = dll != null && dll > 0 && dayPnl < 0 && Math.abs(dayPnl) > dll;

    // Trailing DD floor at this point
    let ddFloorHere;
    if (mllType === "static" || !mllType) {
      ddFloorHere = startBal - mll;
    } else {
      ddFloorHere = peakBal - mll;
      if (ddFloorHere > startBal) ddFloorHere = Math.max(ddFloorHere, startBal);
    }
    const mllBreach = bal < ddFloorHere;

    dailyDetails.push({
      date: e.date, pnl: dayPnl, balance: bal,
      dllBreach, mllBreach, ddFloor: ddFloorHere,
      peakBal,
    });
  });

  // ── Consistency tracking ──
  // If best day = $X and rule is C%, total profit must be >= $X / C
  // So effective target = max(baseTarget, biggestDay / consistency)
  const consistencyPct = totalPnl > 0 && consistency ? biggestDay / totalPnl : 0;
  const consistencyOk = !consistency || totalPnl <= 0 || consistencyPct <= consistency;
  const consistencyAdjTarget = (consistency && biggestDay > 0)
    ? Math.max(baseTarget, biggestDay / consistency)
    : baseTarget;
  // How much MORE you need to earn to make that big day compliant
  const consistencyGap = consistencyAdjTarget > baseTarget
    ? Math.max(0, consistencyAdjTarget - totalPnl)
    : 0;

  // Use the harder of the two targets
  const effectiveTarget = consistencyAdjTarget;
  const remainingProfit = Math.max(0, effectiveTarget - totalPnl);
  const pctComplete = effectiveTarget > 0 ? Math.min(1, totalPnl / effectiveTarget) : 0;

  // ── Drawdown safety (current state) ──
  let ddFloor;
  if (mllType === "static" || !mllType) {
    ddFloor = startBal - mll;
  } else {
    ddFloor = peakBal - mll;
    if (ddFloor > startBal) ddFloor = Math.max(ddFloor, startBal);
  }
  const roomToDD = currentBal - ddFloor;
  const ddPct = mll > 0 ? roomToDD / mll : 1;

  // ── Min profitable days (use balance-derived P&L from dailyDetails) ──
  const profitDays = dailyDetails.filter(d => d.pnl > (minProfit || 0)).length;
  const requiredDays = calcDays(consistency, minDays);
  const daysRemaining = Math.max(0, requiredDays - profitDays);

  // ── DLL violations count ──
  const dllViolations = dailyDetails.filter(d => d.dllBreach).length;

  // ── MLL breach detection ──
  const mllBreached = dailyDetails.some(d => d.mllBreach);

  // ── Live ease — recalculated with remaining (consistency-adjusted) target ──
  const liveEase = remainingProfit > 0
    ? calcEase(dll, mll, remainingProfit, consistency, Math.max(0, (minDays || 0) - profitDays), scalingFactor, mllType)
    : null;

  // ── Win/loss stats (use balance-derived P&L) ──
  const wins = dailyDetails.filter(d => d.pnl > 0).length;
  const losses = dailyDetails.filter(d => d.pnl < 0).length;
  const winRate = dailyDetails.length > 0 ? wins / dailyDetails.length : 0;

  // ── Rules summary ──
  const rules = [];
  // Consistency rule
  // Max safe single-day profit: if you already have totalPnl and biggest day is X,
  // any new day > (totalPnl * consistency / (1 - consistency)) would breach.
  // For funded: the target is just eligibility, so frame as a daily profit cap.
  // Max safe profit on a single NEW day while keeping consistency OK:
  // If new day D becomes the biggest: need D / (totalPnl + D) <= C
  //   → D(1-C) <= C*totalPnl → D <= C * totalPnl / (1 - C)
  // If new day D stays below current biggest: ratio only improves (more total, same biggest)
  // So the binding constraint is: D <= C * totalPnl / (1 - C)
  const maxSafeDayProfit = (consistency && totalPnl > 0)
    ? Math.floor(consistency * totalPnl / (1 - consistency))
    : null;
  // If already breached, how large could the next day be to fix it?
  // They need totalPnl to grow so that biggestDay / newTotal <= consistency
  // newTotal >= biggestDay / consistency → they need (biggestDay/consistency - totalPnl) more spread across OTHER days
  if (consistency) {
    const maxPct = consistency * 100;
    const isFunded = phase === "funded";
    if (consistencyAdjTarget > baseTarget) {
      if (isFunded) {
        // Funded: frame as "don't exceed X per day" + how much more spread profit needed
        const moreNeeded = Math.max(0, Math.ceil(biggestDay / consistency) - totalPnl);
        rules.push({
          label: "Consistency",
          status: "warning",
          detail: `DO NOT make a profit larger than $${Math.round(biggestDay).toLocaleString()} — best day is ${(consistencyPct * 100).toFixed(0)}% of total profit (limit: ${maxPct}%). Need $${moreNeeded.toLocaleString()} more spread across other days to become eligible for max payout.`,
        });
      } else {
        rules.push({
          label: "Consistency",
          status: "warning",
          detail: `Best day $${Math.round(biggestDay).toLocaleString()} (${(consistencyPct * 100).toFixed(0)}%) exceeds ${maxPct}% limit → new target: $${Math.round(consistencyAdjTarget).toLocaleString()} (+$${Math.round(consistencyAdjTarget - baseTarget).toLocaleString()})`,
        });
      }
    } else if (totalPnl > 0 && consistencyPct > consistency * 0.8) {
      const cap = maxSafeDayProfit != null ? `$${maxSafeDayProfit.toLocaleString()}` : "?";
      rules.push({
        label: "Consistency",
        status: "caution",
        detail: isFunded
          ? `DO NOT make a profit larger than ${cap} — best day at ${(consistencyPct * 100).toFixed(0)}% of profit, approaching ${maxPct}% limit`
          : `Best day at ${(consistencyPct * 100).toFixed(0)}% of profit — approaching ${maxPct}% limit. Max safe day: ${cap}`,
      });
    } else {
      const cap = maxSafeDayProfit != null && maxSafeDayProfit > 0 ? `. Max single-day profit: $${maxSafeDayProfit.toLocaleString()}` : "";
      rules.push({ label: "Consistency", status: "ok", detail: `${totalPnl > 0 ? `${(consistencyPct * 100).toFixed(0)}%` : "—"} of ${maxPct}% max — compliant${cap}` });
    }
  }
  // DLL rule
  if (dll) {
    if (dllViolations > 0) {
      rules.push({ label: "Daily Loss Limit", status: "warning", detail: `${dllViolations} day(s) exceeded $${Math.round(dll).toLocaleString()} DLL` });
    } else {
      rules.push({ label: "Daily Loss Limit", status: "ok", detail: `$${Math.round(dll).toLocaleString()} — no violations` });
    }
  }
  // MLL rule
  if (mll) {
    if (mllBreached) {
      rules.push({ label: "Max Loss Limit", status: "breach", detail: `Balance dropped below DD floor — ACCOUNT BREACHED` });
    } else {
      rules.push({ label: "Max Loss Limit", status: ddPct < 0.25 ? "caution" : "ok", detail: `$${Math.round(roomToDD).toLocaleString()} room left (${(ddPct * 100).toFixed(0)}%) — floor at $${Math.round(ddFloor).toLocaleString()} (${mllType})` });
    }
  }
  // Min profitable days
  if (minDays || (consistency && consistency > 0)) {
    if (profitDays >= requiredDays) {
      rules.push({ label: "Min Profit Days", status: "ok", detail: `${profitDays}/${requiredDays} days — met${minProfit > 0 ? ` (min $${minProfit}/day)` : ""}` });
    } else {
      rules.push({ label: "Min Profit Days", status: "caution", detail: `${profitDays}/${requiredDays} days — need ${daysRemaining} more${minProfit > 0 ? ` (min $${minProfit}/day)` : ""}` });
    }
  }

  // ── Reset metrics ──
  const resets = (account.resets || []);
  const resetCount = resets.length;
  const totalResetCost = resets.reduce((s, r) => s + (r.cost || 0), 0);
  // "Resets left to breakeven at latest reset price"
  // Total investment so far: eval cost + activation + all reset costs
  // Max net payout: maxPayout * split
  // Resets left = floor((maxNetPayout - totalInvestment) / latestResetPrice)
  const firmNoResets = f.noResets === true;
  const latestResetPrice = firmNoResets ? null : (resetCount > 0
    ? (resets[resets.length - 1].cost || f.resetPrice || 0)
    : (f.resetPrice || 0));
  const evalCost = f.cost || 0;
  const activationCost = (phase === "funded" || resetCount > 0) ? (f.activation || 0) : 0;
  const totalInvestment = evalCost + activationCost + totalResetCost;
  const maxNetPayout = (f.maxPayout || 0) * (f.split || 1);
  const resetsToBreakeven = !firmNoResets && latestResetPrice > 0
    ? Math.floor((maxNetPayout - totalInvestment) / latestResetPrice)
    : null;

  // ── Today's Trading Plan ──
  const scalingTiers = phase === "challenge" ? migrateScalingTiers(firmData, "sc") : migrateScalingTiers(firmData, "sf");
  const maxNQ = firmData.maxNQ || null;
  // Scaling uses CUMULATIVE profit from account start (not just current payout cycle)
  // so that after payouts you keep your unlocked contract tiers
  const originalStartBal = account.startBalance || 50000;
  const cumulativeProfit = currentBal - originalStartBal + totalPayouts;
  const contractsAllowed = getContractsAtProfit(scalingTiers, maxNQ, Math.max(0, cumulativeProfit));

  // Next scaling threshold — when do they unlock more contracts?
  let nextScalingThreshold = null;
  let nextScalingContracts = null;
  if (scalingTiers && scalingTiers.length > 0 && cumulativeProfit >= 0) {
    for (let i = 0; i < scalingTiers.length; i++) {
      if (scalingTiers[i].upTo != null && cumulativeProfit <= scalingTiers[i].upTo) {
        // Currently in this tier
        if (i < scalingTiers.length - 1) {
          nextScalingThreshold = scalingTiers[i].upTo;
          nextScalingContracts = scalingTiers[i + 1].contracts;
        } else {
          // Last tier → max contracts above it
          nextScalingThreshold = scalingTiers[i].upTo;
          nextScalingContracts = maxNQ;
        }
        break;
      }
    }
  }

  // Max daily profit cap: the strictest of (consistency cap, remaining profit, DLL is not a profit cap)
  // Consistency cap = maxSafeDayProfit (already calculated)
  // Also: can't profit more than roomToDD allows if trailing (otherwise you'd raise the floor)
  const profitCaps = [];
  if (maxSafeDayProfit != null && maxSafeDayProfit > 0) profitCaps.push({ cap: maxSafeDayProfit, reason: "consistency" });
  if (remainingProfit > 0) profitCaps.push({ cap: Math.ceil(remainingProfit), reason: "target" });
  const strictestProfitCap = profitCaps.length > 0
    ? profitCaps.reduce((best, c) => c.cap < best.cap ? c : best)
    : null;

  // Max daily loss: the lesser of DLL and remaining room to DD
  const maxDailyLoss = dll
    ? Math.min(dll, Math.max(0, Math.floor(roomToDD)))
    : Math.max(0, Math.floor(roomToDD));

  // Ideal daily target: aim for payout in the SHORTEST time possible
  // Constraints: (a) need at least daysRemaining more profit days
  //              (b) each day limited to maxSafeDayProfit (consistency)
  //              (c) each day must be >= minProfit to count
  // Minimum days = max(daysRemaining, ceil(remaining / maxSafe))
  const effectiveDaysLeft = Math.max(daysRemaining, 1);
  const minDaysFromCap = (maxSafeDayProfit != null && maxSafeDayProfit > 0)
    ? Math.ceil(remainingProfit / maxSafeDayProfit)
    : 1;
  const minDaysToComplete = Math.max(effectiveDaysLeft, minDaysFromCap, 1);
  const idealDailyTarget = remainingProfit > 0
    ? Math.max(minProfit || 0, Math.ceil(remainingProfit / minDaysToComplete))
    : 0;

  // Payout tier info for funded
  const payoutTiers = f.payoutTiers || [];
  const nextPayoutNum = payouts.length + 1;
  const currentPayoutTier = getPayoutTierForNumber(payoutTiers, nextPayoutNum);

  // Build the plan object
  const todayPlan = {
    contractsAllowed,
    maxContracts: maxNQ,
    maxDailyProfit: strictestProfitCap ? strictestProfitCap.cap : null,
    maxDailyProfitReason: strictestProfitCap ? strictestProfitCap.reason : null,
    maxDailyLoss,
    idealDailyTarget,
    daysLeft: effectiveDaysLeft,
    minDaysToComplete,
    daysNeeded: daysRemaining,
    minProfitPerDay: minProfit || 0,
    nextScalingThreshold,
    nextScalingContracts,
    // For funded: current payout tier
    nextPayoutNum,
    payoutMin: currentPayoutTier.min || 0,
    payoutMax: currentPayoutTier.max, // null = unlimited
    isBreached: mllBreached || ddPct <= 0,
    isTargetHit: pctComplete >= 1 && profitDays >= requiredDays && consistencyOk && !mllBreached && ddPct > 0,
    profitTargetMet: pctComplete >= 1,
  };

  // allRulesMet: ALL conditions must be true for target hit / payout ready
  const allRulesMet = pctComplete >= 1 && profitDays >= requiredDays && consistencyOk && !mllBreached && ddPct > 0;

  return {
    currentBal, totalPnl, target: effectiveTarget, baseTarget, remainingProfit, pctComplete,
    roomToDD, ddFloor, ddPct, peakBal,
    profitDays, requiredDays, daysRemaining,
    consistencyOk, consistencyPct, biggestDay, biggestDayDate,
    consistencyAdjTarget, consistencyGap, maxSafeDayProfit,
    allRulesMet,
    liveEase, wins, losses, winRate,
    phase, mll, mllType, dll,
    dllViolations, mllBreached,
    rules, dailyDetails,
    totalPayouts, payoutCount: payouts.length, effectiveStartBal,
    cycleEntries: entries.length, allEntriesCount: allEntries.length,
    // Reset metrics
    resetCount, totalResetCost, latestResetPrice, resetsToBreakeven, totalInvestment,
    // Today's plan
    todayPlan,
  };
}

// CSV trade import parser
// Handles formats: "$1,080.00", "$(1,035.00)", "$355.00", "-$500.00", "1080", etc.
function parsePnlValue(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Detect negative: $(xxx) or -$xxx or (xxx)
  const isNeg = /\(/.test(s) || /^-/.test(s);
  // Strip everything except digits and dot
  const num = parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
  return isNeg ? -num : num;
}

function parseTimestampDate(ts) {
  if (!ts) return null;
  // Handle "MM/DD/YYYY HH:MM:SS" or "YYYY-MM-DD" or similar
  const s = String(ts).trim();
  // Try MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // Try YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

// Shared CSV row parser — handles quoted fields
function parseCsvRow(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseCsvToJournal(csvText, startBalance) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { entries: [], error: "No data rows found" };

  // Parse header
  const hdr = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"/, "").replace(/"$/, ""));

  // ── Auto-detect format ──
  // Format A: Balance History (daily rows with EOD balance + daily P&L)
  //   Headers like: account id, account name, trade date, total amount, total realized pnl
  const balIdx = hdr.findIndex(h => h === "total amount" || h === "totalamount" || h === "total_amount" || h === "balance" || h === "eod_balance" || h === "eodbalance" || h === "ending_balance" || h === "endingbalance" || h === "equity");
  const balPnlIdx = hdr.findIndex(h => h === "total realized pnl" || h === "totalrealizedpnl" || h === "total_realized_pnl" || h === "realized_pnl" || h === "realizedpnl" || h === "daily_pnl" || h === "dailypnl" || h === "day_pnl");
  const balDateIdx = hdr.findIndex(h => h === "trade date" || h === "tradedate" || h === "trade_date" || h === "date");

  const isBalanceFormat = balIdx >= 0 && balPnlIdx >= 0 && balDateIdx >= 0;

  if (isBalanceFormat) {
    // ── Format A: Balance History — already daily aggregated ──
    let parseErrors = 0;
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvRow(lines[i]);
      if (cols.length <= Math.max(balIdx, balPnlIdx, balDateIdx)) { parseErrors++; continue; }

      const date = parseTimestampDate(cols[balDateIdx]);
      const balance = parsePnlValue(cols[balIdx]);
      const pnl = parsePnlValue(cols[balPnlIdx]);
      if (!date) { parseErrors++; continue; }
      // Skip zero-activity days (balance unchanged, no P&L) — optional, keep them for completeness
      entries.push({
        id: Date.now() + Math.random(),
        date,
        balance: Math.round(balance * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        trades: 0, // not available in this format
        notes: pnl === 0 ? "No trading activity" : "",
      });
    }
    entries.sort((a, b) => a.date > b.date ? 1 : -1);
    return {
      entries,
      summary: `${entries.length} daily records imported (balance history format), ${parseErrors > 0 ? `${parseErrors} rows skipped` : "all parsed ok"}`,
    };
  }

  // ── Format B: Trade-level data (individual trades, need grouping) ──
  const pnlIdx = hdr.findIndex(h => h === "pnl" || h === "p&l" || h === "profit" || h === "net" || h === "netpnl" || h === "net_pnl" || h === "realized_pnl");
  const dateIdx = hdr.findIndex(h => h.includes("timestamp") || h.includes("date") || h.includes("time") || h === "boughttimestamp" || h === "soldtimestamp");
  // Prefer soldTimestamp if available
  const soldIdx = hdr.findIndex(h => h === "soldtimestamp" || h === "sold_timestamp" || h === "closetime" || h === "close_time" || h === "exittime");
  const boughtIdx = hdr.findIndex(h => h === "boughttimestamp" || h === "bought_timestamp" || h === "opentime" || h === "open_time" || h === "entrytime");
  const useDateIdx = soldIdx >= 0 ? soldIdx : boughtIdx >= 0 ? boughtIdx : dateIdx;
  const symbolIdx = hdr.findIndex(h => h === "symbol" || h === "instrument" || h === "ticker");

  if (pnlIdx < 0) return { entries: [], error: `Could not find a P&L column. Headers found: ${hdr.join(", ")}` };
  if (useDateIdx < 0) return { entries: [], error: `Could not find a date/timestamp column. Headers found: ${hdr.join(", ")}` };

  // Group trades by date
  const dayMap = {};
  let parseErrors = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length <= Math.max(pnlIdx, useDateIdx)) { parseErrors++; continue; }

    const date = parseTimestampDate(cols[useDateIdx]);
    const pnl = parsePnlValue(cols[pnlIdx]);
    if (!date) { parseErrors++; continue; }

    if (!dayMap[date]) dayMap[date] = { pnl: 0, trades: 0, symbols: new Set() };
    dayMap[date].pnl += pnl;
    dayMap[date].trades += 1;
    if (symbolIdx >= 0 && cols[symbolIdx]) dayMap[date].symbols.add(cols[symbolIdx]);
  }

  // Build journal entries sorted by date with running balance
  const dates = Object.keys(dayMap).sort();
  let runningBal = startBalance;
  const entries = dates.map(date => {
    const d = dayMap[date];
    runningBal += d.pnl;
    return {
      id: Date.now() + Math.random(),
      date,
      balance: Math.round(runningBal * 100) / 100,
      pnl: Math.round(d.pnl * 100) / 100,
      trades: d.trades,
      notes: d.symbols.size > 0 ? `Instruments: ${[...d.symbols].join(", ")}` : "",
    };
  });

  return {
    entries,
    summary: `${lines.length - 1} trades → ${entries.length} days, ${parseErrors > 0 ? `${parseErrors} rows skipped` : "all parsed ok"}`,
  };
}

// Journal Entry Form — Phase 8 will do a full redesign; this adds dark-mode support.
function JournalEntryForm({ onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || { date: new Date().toISOString().slice(0, 10), balance: "", pnl: "", trades: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const labelCls = "mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400";
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" className={inputCls} value={form.date} onChange={e => set("date", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>EOD Balance</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[13px] dark:text-slate-500">$</span>
            <input type="number" step="any" className={inputCls} value={form.balance} onChange={e => set("balance", e.target.value === "" ? "" : Number(e.target.value))} placeholder="50000" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Day P&L</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[13px] dark:text-slate-500">$</span>
            <input type="number" step="any" className={inputCls} value={form.pnl} onChange={e => set("pnl", e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" />
          </div>
        </div>
        <div>
          <label className={labelCls}># Trades</label>
          <input type="number" className={inputCls} value={form.trades} onChange={e => set("trades", e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <input type="text" className={inputCls} value={form.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="What happened today..." />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={() => { if (!form.balance && form.balance !== 0) { alert("Balance is required"); return; } onSave({ ...form, id: initial?.id || Date.now() }); }}>
          {initial ? "Update" : "Add Entry"}
        </Button>
      </div>
    </div>
  );
}

// Metric badge — compact KPI tile used in AccountCard
const METRIC_TONES = {
  green:   "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300",
  red:     "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300",
  amber:   "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300",
  blue:    "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300",
  gray:    "bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200",
};
function MetricBadge({ label, value, sub, color }) {
  const cls = METRIC_TONES[color] || METRIC_TONES.gray;
  return (
    <div className={"rounded-lg border px-2.5 py-2 text-center " + cls}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold leading-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] leading-tight opacity-65 tabular-nums">{sub}</div>}
    </div>
  );
}

// Progress bar
const PROGRESS_TONES = {
  green: "bg-emerald-500 dark:bg-emerald-500",
  red:   "bg-red-500 dark:bg-red-500",
  amber: "bg-amber-500 dark:bg-amber-500",
  blue:  "bg-blue-500 dark:bg-blue-500",
};
function ProgressBar({ pct, label, color }) {
  const fill = PROGRESS_TONES[color] || PROGRESS_TONES.blue;
  const clamped = Math.min(100, Math.max(0, pct * 100));
  return (
    <div>
      {label && (
        <div className="mb-1 text-[11.5px] font-medium text-slate-600 dark:text-slate-400">{label}</div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className={"h-full rounded-full transition-all duration-300 ease-out " + fill}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// Payout Form
function PayoutForm({ currentBalance, firmData, onSave, onCancel, payoutNumber }) {
  const split = firmData?.split || 1;
  const payoutTiers = firmData?.payoutTiers || [];
  const tier = getPayoutTierForNumber(payoutTiers, payoutNumber || 1);
  const tierMin = tier.min || 0;
  const tierMax = tier.max; // null = unlimited
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [newBalance, setNewBalance] = useState(currentBalance);
  const [notes, setNotes] = useState("");

  const grossAmount = amount ? Number(amount) : 0;
  const netAmount = Math.round(grossAmount * split * 100) / 100;
  const belowMin = grossAmount > 0 && grossAmount < tierMin;
  const aboveMax = grossAmount > 0 && tierMax != null && grossAmount > tierMax;

  const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const labelCls = "mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400";
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-800 dark:text-emerald-300">
          <Award size={13} strokeWidth={2.5} aria-hidden="true" />
          Record Payout #{payoutNumber || 1}
        </div>
        {payoutTiers.length > 0 && (
          <div className="text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums">
            Tier limits: min {money(tierMin)}{tierMax != null ? ` — max ${money(tierMax)}` : " — no max limit"}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Payout Amount (gross)</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[13px] dark:text-slate-500">$</span>
            <input
              type="number"
              step="any"
              className={inputCls + (belowMin || aboveMax ? " !border-red-400 !bg-red-50 dark:!bg-red-950/30" : "")}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={tierMax != null ? `${tierMin}–${tierMax}` : `min ${tierMin}`}
            />
          </div>
          {grossAmount > 0 && split < 1 && (
            <div className="mt-0.5 text-[10.5px] text-emerald-700 dark:text-emerald-400 tabular-nums">Net after {(split * 100).toFixed(0)}% split: {money(netAmount)}</div>
          )}
          {belowMin && <div className="mt-0.5 text-[10.5px] text-red-600 dark:text-red-400">Below minimum payout ({money(tierMin)})</div>}
          {aboveMax && <div className="mt-0.5 text-[10.5px] text-red-600 dark:text-red-400">Exceeds maximum payout ({money(tierMax)})</div>}
        </div>
        <div>
          <label className={labelCls}>New Starting Balance</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[13px] dark:text-slate-500">$</span>
            <input type="number" step="any" className={inputCls} value={newBalance} onChange={e => setNewBalance(Number(e.target.value))} />
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">Balance after payout withdrawal</div>
        </div>
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input type="text" className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Payout #1" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          className="!bg-emerald-600 !text-white hover:!bg-emerald-700 dark:!bg-emerald-500 dark:hover:!bg-emerald-600"
          onClick={() => {
            if (!grossAmount || grossAmount <= 0) { alert("Enter a payout amount"); return; }
            onSave({ date, amount: grossAmount, netAmount, newBalance, notes });
          }}
        >
          Record Payout
        </Button>
      </div>
    </div>
  );
}

// Reset Form
function ResetForm({ firmData, defaultCost, startBalance, onSave, onCancel }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(defaultCost || 0);
  const [newBalance, setNewBalance] = useState(startBalance);
  const [notes, setNotes] = useState("");

  const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const labelCls = "mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400";
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
        <RefreshCw size={13} strokeWidth={2.5} aria-hidden="true" />
        Reset Account
      </div>
      <div className="text-[11px] text-amber-700/90 dark:text-amber-400/90">
        This clears the journal and restarts metrics. The cost is recorded as an expense.
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Reset Cost</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[13px] dark:text-slate-500">$</span>
            <input type="number" step="any" className={inputCls} value={cost} onChange={e => setCost(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className={labelCls}>New Starting Balance</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[13px] dark:text-slate-500">$</span>
            <input type="number" step="any" className={inputCls} value={newBalance} onChange={e => setNewBalance(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input type="text" className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Breached on NQ" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          className="!bg-amber-600 !text-white hover:!bg-amber-700 dark:!bg-amber-500 dark:hover:!bg-amber-600"
          onClick={() => {
            if (!confirm("Reset this account? Journal entries will be cleared and a new cycle begins.")) return;
            onSave({ date, cost, newBalance, notes });
          }}
        >
          Confirm Reset
        </Button>
      </div>
    </div>
  );
}

// Single Account Card
function AccountCard({ account, firmData, onUpdate, onDelete, collapsed, onToggleCollapse, selected, onToggleSelect }) {
  const [showJournal, setShowJournal] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [addingPayout, setAddingPayout] = useState(false);
  const [showPayouts, setShowPayouts] = useState(false);
  const [addingReset, setAddingReset] = useState(false);
  const [showResets, setShowResets] = useState(false);
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  const fileInputRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null);
  const m = calcLiveMetrics(account, firmData);
  const f = firmData ? computeAll(firmData) : null;
  const entries = (account.journal || []).sort((a, b) => a.date > b.date ? 1 : -1);
  const payouts = (account.payouts || []).slice().sort((a, b) => a.date > b.date ? 1 : -1);
  const resets = (account.resets || []).slice().sort((a, b) => a.date > b.date ? 1 : -1);

  const handleAddEntry = (entry) => {
    const updated = { ...account, journal: [...(account.journal || []), entry] };
    onUpdate(updated);
    setAddingEntry(false);
  };

  const handleUpdateEntry = (entry) => {
    const updated = { ...account, journal: (account.journal || []).map(e => e.id === entry.id ? entry : e) };
    onUpdate(updated);
    setEditingEntry(null);
  };

  const handleDeleteEntry = (entryId) => {
    if (!confirm(t("alertDeleteEntry"))) return;
    const updated = { ...account, journal: (account.journal || []).filter(e => e.id !== entryId) };
    onUpdate(updated);
  };

  const handleAddPayout = (payout) => {
    const updated = { ...account, payouts: [...(account.payouts || []), { ...payout, id: Date.now() + Math.random() }] };
    onUpdate(updated);
    setAddingPayout(false);
  };

  const handleDeletePayout = (payoutId) => {
    if (!confirm(t("alertDeletePayout"))) return;
    const updated = { ...account, payouts: (account.payouts || []).filter(p => p.id !== payoutId) };
    onUpdate(updated);
  };

  const handleReset = ({ date, cost, newBalance, notes }) => {
    const resetEntry = {
      id: Date.now() + Math.random(),
      date,
      cost: Number(cost) || 0,
      newBalance: Number(newBalance),
      notes,
      previousJournalCount: (account.journal || []).length,
    };
    const updated = {
      ...account,
      resets: [...(account.resets || []), resetEntry],
      journal: [], // Clear journal on reset
      startBalance: Number(newBalance),
      payouts: [], // Clear payouts too — new cycle
    };
    onUpdate(updated);
    setAddingReset(false);
  };

  const handleDeleteReset = (resetId) => {
    if (!confirm(t("alertDeleteReset"))) return;
    const updated = { ...account, resets: (account.resets || []).filter(r => r.id !== resetId) };
    onUpdate(updated);
  };

  const togglePhase = () => {
    const newPhase = account.phase === "challenge" ? "funded" : "challenge";
    onUpdate({ ...account, phase: newPhase, journal: [] });
  };

  const handleCsvImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const startBal = account.startBalance || 50000;
      // If there are existing entries, use the last balance as starting point
      const existingEntries = account.journal || [];
      const baseBal = existingEntries.length > 0
        ? existingEntries.sort((a, b) => a.date > b.date ? 1 : -1)[existingEntries.length - 1].balance
        : startBal;
      const { entries, error, summary } = parseCsvToJournal(text, baseBal);
      if (error) { setImportMsg(`❌ ${error}`); return; }
      if (entries.length === 0) { setImportMsg(`❌ ${t("alertNoValidEntries")}`); return; }
      // Merge: skip dates that already exist
      const existingDates = new Set(existingEntries.map(e => e.date));
      const newEntries = entries.filter(e => !existingDates.has(e.date));
      if (newEntries.length === 0) { setImportMsg(`⚠️ ${t("alertDatesExist")}`); return; }
      const updated = { ...account, journal: [...existingEntries, ...newEntries] };
      onUpdate(updated);
      setImportMsg(`✅ Imported: ${summary}. ${newEntries.length} new days added.`);
      setTimeout(() => setImportMsg(null), 5000);
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset so same file can be imported again
  };

  // ── Status tone mapping (semantic) ──
  const statusColor = !f ? "gray" : m.allRulesMet ? "green" : m.ddPct <= 0 ? "red" : m.ddPct < 0.25 ? "red" : m.ddPct < 0.5 ? "amber" : "blue";
  const statusLabel = !f ? t("statusNoFirm") : m.allRulesMet ? (m.phase === "challenge" ? t("statusTargetHit") : t("statusPayoutReady")) : m.ddPct <= 0 ? t("statusBreached") : t("statusActive");
  const statusBadgeVariant = statusColor === "green" ? "success" : statusColor === "red" ? "danger" : statusColor === "amber" ? "warn" : statusColor === "blue" ? "info" : "neutral";
  const phaseBadgeVariant = firmData?.instant ? "info" : account.phase === "challenge" ? "warn" : statusColor === "red" ? "danger" : "accent";
  const phaseLabel = firmData?.instant ? t("labelInstant") : account.phase === "challenge" ? t("labelChallenge") : t("labelFunded");
  // Outer card tone
  const cardBorder = selected
    ? "border-blue-400 ring-2 ring-blue-500/20 dark:border-blue-500"
    : statusColor === "red"
    ? "border-red-200 dark:border-red-900/60"
    : statusColor === "green"
    ? "border-emerald-200 dark:border-emerald-900/60"
    : "border-slate-200 dark:border-slate-800";
  // Left accent
  const accentStripe = statusColor === "red"
    ? "bg-red-400 dark:bg-red-500"
    : statusColor === "green"
    ? "bg-emerald-400 dark:bg-emerald-500"
    : statusColor === "amber"
    ? "bg-amber-400 dark:bg-amber-500"
    : "bg-blue-400 dark:bg-blue-500";

  return (
    <div
      className={
        "group relative overflow-hidden rounded-lg border bg-white transition-colors duration-150 " +
        "dark:bg-slate-900 " + cardBorder
      }
    >
      {/* Status accent strip */}
      <span aria-hidden="true" className={"absolute left-0 top-0 h-full w-[3px] " + accentStripe} />

      {/* ── Header — always visible ── */}
      <div
        className={
          "group/hdr flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3 pl-5 " +
          "transition-colors duration-150 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 " +
          (collapsed ? "" : "border-b border-slate-100 dark:border-slate-800")
        }
        onClick={onToggleCollapse}
        role="button"
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {onToggleSelect && (
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-blue-600"
              checked={!!selected}
              onChange={onToggleSelect}
              onClick={e => e.stopPropagation()}
              aria-label="Select account"
            />
          )}
          <ChevronDown
            size={14}
            strokeWidth={2.25}
            aria-hidden="true"
            className={
              "shrink-0 text-slate-400 transition-transform duration-200 ease-out dark:text-slate-500 " +
              (collapsed ? "-rotate-90" : "rotate-0")
            }
          />
          <Badge variant={phaseBadgeVariant} size="sm" className="shrink-0">{phaseLabel}</Badge>
          <h3 className="truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            {account.label || `${firmData?.name || "?"} ${firmData?.model || ""}`}
          </h3>
          <Badge variant={statusBadgeVariant} size="sm" dot className="shrink-0">{statusLabel}</Badge>

          {/* Collapsed compact stats */}
          {collapsed && f && (
            <div className="ml-auto flex min-w-0 shrink items-center gap-3 overflow-hidden text-[11.5px] text-slate-500 dark:text-slate-400">
              <span className="shrink-0 tabular-nums">
                P&L:{" "}
                <b className={m.totalPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {money(m.totalPnl)}
                </b>
              </span>
              <span className="shrink-0 tabular-nums">
                DD:{" "}
                <b className={m.ddPct >= 0.5 ? "text-emerald-600 dark:text-emerald-400" : m.ddPct >= 0.25 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                  {(m.ddPct * 100).toFixed(0)}%
                </b>
              </span>
              <span className="shrink-0 tabular-nums">{(m.pctComplete * 100).toFixed(0)}% complete</span>
              {m.todayPlan && !m.todayPlan.isBreached && !m.todayPlan.isTargetHit && m.todayPlan.contractsAllowed && (
                <span className="hidden shrink-0 border-l border-slate-200 pl-3 tabular-nums dark:border-slate-700 lg:inline">
                  <b className="text-slate-700 dark:text-slate-300">{m.todayPlan.contractsAllowed}</b> NQ → aim{" "}
                  <b className="text-emerald-600 dark:text-emerald-400">{money(m.todayPlan.idealDailyTarget)}</b> / max loss{" "}
                  <b className="text-red-600 dark:text-red-400">{money(m.todayPlan.maxDailyLoss)}</b>
                </span>
              )}
              {m.totalPayouts > 0 && (
                <span className="hidden shrink-0 tabular-nums sm:inline">
                  Paid: <b className="text-emerald-600 dark:text-emerald-400">{money(m.totalPayouts)}</b>
                </span>
              )}
              {account.autoEnabled && (
                <span className="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-3 text-emerald-600 dark:border-slate-700 dark:text-emerald-400">
                  <Zap size={10} className="fill-current" aria-hidden="true" /> Auto
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              const newVal = !account.autoEnabled;
              onUpdate({ ...account, autoEnabled: newVal });
              if (newVal && !collapsed) setShowAutoSettings(true);
            }}
            title={account.autoEnabled ? t("autoEnabled") : t("autoDisabled")}
            aria-pressed={!!account.autoEnabled}
            className={
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold transition-colors duration-150 " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
              (account.autoEnabled
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200")
            }
          >
            <Zap size={11} strokeWidth={2.5} className={account.autoEnabled ? "fill-emerald-500" : ""} aria-hidden="true" />
            {t("autoToggle")}
          </button>
          {!firmData?.instant && (
            <IconButton
              icon={RefreshCw}
              label="Switch phase"
              size="icon-sm"
              variant="ghost"
              onClick={togglePhase}
            />
          )}
          <IconButton
            icon={Trash2}
            label={t("delete")}
            size="icon-sm"
            variant="ghost-danger"
            onClick={() => onDelete(account.id)}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 pb-2 pl-5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Clock size={11} strokeWidth={2.25} aria-hidden="true" className="text-slate-400 dark:text-slate-500" />
          {t("started")} <span className="tabular-nums">{account.startDate || "—"}</span>
        </span>
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <span>{entries.length} {t("journalEntries")}</span>
        {payouts.length > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {payouts.length} {t("payoutN")}{payouts.length !== 1 ? "s" : ""} ({money(m.totalPayouts)})
            </span>
          </>
        )}
        {resets.length > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {resets.length} {t("resetN")}{resets.length !== 1 ? "s" : ""} ({money(m.totalResetCost)})
            </span>
          </>
        )}
      </div>

      {/* Automation Settings Panel */}
      {!collapsed && account.autoEnabled && (
        <div className="border-t border-slate-100 bg-emerald-50/40 dark:border-slate-800 dark:bg-emerald-950/20">
          <div className="px-4 py-3 pl-5">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                >
                  <Zap size={11} strokeWidth={2.5} className="fill-current" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  {t("autoSettings")}
                </span>
              </div>
              <Badge variant="success" size="sm" dot>{t("autoStatusActive")}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("autoSession")}</label>
                <select
                  value={account.autoSessions || "both"}
                  onChange={(e) => onUpdate({ ...account, autoSessions: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="london">{t("autoSessionLondon")}</option>
                  <option value="ny">{t("autoSessionNy")}</option>
                  <option value="both">{t("autoSessionBoth")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("autoTradovateId")}</label>
                <input
                  type="text"
                  value={account.tradovateAccountId || ""}
                  onChange={(e) => onUpdate({ ...account, tradovateAccountId: e.target.value })}
                  placeholder={t("autoTradovateIdPlaceholder")}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("autoTradovateUsername")}</label>
                <input
                  type="text"
                  value={account.tradovateUsername || ""}
                  onChange={(e) => onUpdate({ ...account, tradovateUsername: e.target.value })}
                  placeholder={t("autoTradovateUsernamePlaceholder")}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("autoTradovatePassword")}</label>
                <input
                  type="password"
                  value={account.tradovatePassword || ""}
                  onChange={(e) => onUpdate({ ...account, tradovatePassword: e.target.value })}
                  placeholder={t("autoTradovatePasswordPlaceholder")}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{t("autoTradovateCredNote")}</p>
          </div>
        </div>
      )}

      {/* ── Metrics Dashboard (when expanded) ── */}
      {!collapsed && f && (
        <div className="space-y-3 px-4 py-3 pl-5">
          {/* Top row — key numbers */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <MetricBadge label={t("balance")} value={money(m.currentBal)} sub={m.payoutCount > 0 ? `${t("cycleStart")} ${money(m.effectiveStartBal)}` : `${t("start")} ${money(account.startBalance || 50000)}`} />
            <MetricBadge label={t("totalPnl")} value={money(m.totalPnl)} color={m.totalPnl > 0 ? "green" : m.totalPnl < 0 ? "red" : "gray"} sub={`${t("target")}: ${money(m.target)}`} />
            <MetricBadge label={t("remaining")} value={money(m.remainingProfit)} color={m.remainingProfit <= 0 ? "green" : "amber"} sub={`${(m.pctComplete * 100).toFixed(0)}% ${t("complete").toLowerCase()}`} />
            <MetricBadge label={t("roomToDD")} value={money(m.roomToDD)} color={m.ddPct >= 0.5 ? "green" : m.ddPct >= 0.25 ? "amber" : "red"} sub={`${t("floor")}: ${money(m.ddFloor)}`} />
            <MetricBadge label={t("liveEase")} value={m.liveEase != null ? pct(m.liveEase) : m.allRulesMet ? "Done" : "—"} color={m.liveEase != null ? (m.liveEase >= 0.45 ? "green" : m.liveEase >= 0.25 ? "amber" : "red") : "gray"} sub={t("recalculated")} />
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ProgressBar pct={m.pctComplete} label={`${t("profitOfTarget", (m.pctComplete * 100).toFixed(0))} ${m.target > m.baseTarget ? "adjusted " : ""}${t("target")}`} color={m.pctComplete >= 1 ? "green" : "blue"} />
            <ProgressBar pct={m.ddPct} label={`${t("safetyDDRoom", (m.ddPct * 100).toFixed(0))}`} color={m.ddPct >= 0.5 ? "green" : m.ddPct >= 0.25 ? "amber" : "red"} />
          </div>

          {/* ── Today's Trading Plan ── */}
          {m.todayPlan && !m.todayPlan.isBreached && (
            <div
              className={
                "space-y-2 rounded-lg border p-3 " +
                (m.todayPlan.isTargetHit
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40")
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {m.todayPlan.isTargetHit ? (
                    <>
                      <Target size={12} strokeWidth={2.5} aria-hidden="true" className="text-emerald-600 dark:text-emerald-400" />
                      {m.phase === "funded" ? t("payoutReady") : t("targetReached")}
                    </>
                  ) : (
                    <>
                      <ClipboardList size={12} strokeWidth={2.5} aria-hidden="true" className="text-slate-500 dark:text-slate-400" />
                      {t("todaysTradingPlan")}
                    </>
                  )}
                </div>
                <Badge variant={m.totalPnl >= 0 ? "success" : "danger"} size="sm">
                  {m.totalPnl >= 0 ? "+" : ""}{money(m.totalPnl)} P&L
                </Badge>
              </div>

              {m.todayPlan.isTargetHit ? (
                /* Target hit / payout ready state */
                <div className="space-y-1.5">
                  {m.phase === "funded" ? (
                    <div className="text-[13px] text-emerald-800 dark:text-emerald-300">
                      <b>{t("requestPayout", m.todayPlan.nextPayoutNum)}</b>
                      {m.todayPlan.payoutMax != null ? (
                        <> — {t("min")} <span className="tabular-nums">{money(m.todayPlan.payoutMin)}</span>, {t("max")} <span className="tabular-nums">{money(m.todayPlan.payoutMax)}</span></>
                      ) : (
                        <> — {t("min")} <span className="tabular-nums">{money(m.todayPlan.payoutMin)}</span>, <span className="font-semibold">{t("unlimited")}</span></>
                      )}
                    </div>
                  ) : (
                    <div className="text-[13px] text-emerald-800 dark:text-emerald-300">
                      <b>{t("advanceToFunded")}</b> {t("profitTarget").toLowerCase()} {t("of")} <span className="tabular-nums">{money(m.target)}</span> {t("met").toLowerCase()}.
                    </div>
                  )}
                  {m.todayPlan.contractsAllowed && (
                    <div className="text-[11.5px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {t("allowed")}: <b className="text-slate-700 dark:text-slate-300">{m.todayPlan.contractsAllowed}</b> / {m.todayPlan.maxContracts || "?"} {t("contracts").toLowerCase()}
                      {m.todayPlan.maxDailyProfit != null && <> • Max safe day profit: <b className="text-amber-700 dark:text-amber-400">{money(m.todayPlan.maxDailyProfit)}</b></>}
                      {m.todayPlan.maxDailyLoss > 0 && <> • Max loss: <b className="text-red-600 dark:text-red-400">{money(m.todayPlan.maxDailyLoss)}</b></>}
                    </div>
                  )}
                </div>
              ) : (
                /* Active trading state */
                <div className="space-y-2">
                  {/* Main instruction row */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {/* Contracts */}
                    <PlanStat
                      tone="slate"
                      icon={Layers}
                      label={t("contracts")}
                      value={m.todayPlan.contractsAllowed || "?"}
                      sub={t("ofMax", m.todayPlan.maxContracts || "?")}
                      extra={
                        m.todayPlan.nextScalingThreshold != null && m.todayPlan.contractsAllowed < (m.todayPlan.maxContracts || Infinity) ? (
                          <span className="text-blue-500 dark:text-blue-400">+1 at {money(m.todayPlan.nextScalingThreshold)} profit</span>
                        ) : null
                      }
                    />
                    {/* Target */}
                    <PlanStat
                      tone="emerald"
                      icon={Target}
                      label={t("aimFor")}
                      value={money(m.todayPlan.idealDailyTarget)}
                      sub={t("leftOver", money(m.remainingProfit), m.todayPlan.minDaysToComplete)}
                      extra={
                        m.todayPlan.minProfitPerDay > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">{t("minToCount", money(m.todayPlan.minProfitPerDay))}</span>
                        ) : null
                      }
                    />
                    {/* Risk */}
                    <PlanStat
                      tone="red"
                      icon={Shield}
                      label={t("maxLoss")}
                      value={money(m.todayPlan.maxDailyLoss)}
                      sub={m.dll ? `${t("dll")}: ${money(m.dll)}` : t("noDll")}
                    />
                  </div>

                  {/* Guardrails row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                    {m.todayPlan.maxDailyProfit != null && (
                      <span className="tabular-nums">
                        {m.todayPlan.maxDailyProfitReason === "consistency" ? (
                          <>{t("doNotProfit")} <b className="text-amber-700 dark:text-amber-400">{money(m.todayPlan.maxDailyProfit)}</b> ({t("consistency").toLowerCase()})</>
                        ) : (
                          <>Remaining to {t("target")}: <b className="text-slate-700 dark:text-slate-300">{money(m.todayPlan.maxDailyProfit)}</b></>
                        )}
                      </span>
                    )}
                    <span className="tabular-nums">
                      {t("ddRoom")}: <b className={m.ddPct >= 0.5 ? "text-emerald-600 dark:text-emerald-400" : m.ddPct >= 0.25 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>{money(m.roomToDD)}</b> ({(m.ddPct * 100).toFixed(0)}%)
                    </span>
                    {m.todayPlan.daysNeeded > 0 && (
                      <span className="tabular-nums">{t("profitDaysNeeded")}: <b className="text-slate-700 dark:text-slate-300">{m.todayPlan.daysNeeded}</b></span>
                    )}
                    {m.phase === "funded" && m.todayPlan.payoutMax != null && (
                      <span className="tabular-nums">{t("payoutMax", m.todayPlan.nextPayoutNum)}: <b className="text-blue-600 dark:text-blue-400">{money(m.todayPlan.payoutMax)}</b></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Breached state */}
          {m.todayPlan && m.todayPlan.isBreached && (
            <Alert variant="danger" title="Account Breached">
              This account has breached its drawdown limit. <b>Do not trade.</b>
              {!f?.noResets && <> Use the Reset button below to restart with a fresh journal.</>}
            </Alert>
          )}

          {/* Secondary stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              Win rate: <b className="text-slate-700 dark:text-slate-300">{(m.winRate * 100).toFixed(0)}%</b> ({m.wins}W / {m.losses}L)
            </span>
            <span className="tabular-nums">Peak: <b className="text-slate-700 dark:text-slate-300">{money(m.peakBal)}</b></span>
            <span className="tabular-nums">MLL: {money(m.mll)} ({m.mllType})</span>
            {m.resetCount > 0 && (
              <span className="tabular-nums">Resets: <b className="text-amber-600 dark:text-amber-400">{m.resetCount}</b> (cost: {money(m.totalResetCost)})</span>
            )}
            {m.resetCount > 0 && m.resetsToBreakeven != null && (
              <span className="tabular-nums">
                Resets to breakeven:{" "}
                <b className={m.resetsToBreakeven > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                  {m.resetsToBreakeven > 0 ? m.resetsToBreakeven : "exceeded"}
                </b>
              </span>
            )}
          </div>

          {/* ── Rules Compliance Panel ── */}
          {m.rules && m.rules.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <ShieldAlert size={12} strokeWidth={2.5} aria-hidden="true" />
                Rules Compliance
              </div>
              {m.rules.map((r, i) => <RuleRow key={i} rule={r} />)}

              {/* Consistency target adjustment callouts */}
              {m.consistencyAdjTarget > m.baseTarget && m.phase === "challenge" && (
                <Alert variant="danger" className="mt-2" title="Target adjusted">
                  <span className="tabular-nums">{money(m.baseTarget)} → {money(m.consistencyAdjTarget)} (+{money(m.consistencyAdjTarget - m.baseTarget)}).</span>
                  {m.consistencyGap > 0 && <> Need <b className="tabular-nums">{money(m.consistencyGap)}</b> more profit to become compliant, or spread profits across more days.</>}
                </Alert>
              )}
              {m.consistencyAdjTarget > m.baseTarget && m.phase === "funded" && m.consistencyGap > 0 && (
                <Alert variant="danger" className="mt-2" title="Payout eligibility at risk">
                  Need <b className="tabular-nums">{money(m.consistencyGap)}</b> more profit spread across other days before requesting max payout.
                </Alert>
              )}
              {m.consistencyAdjTarget > m.baseTarget && m.phase === "funded" && m.consistencyGap <= 0 && m.allRulesMet && (
                <Alert variant="success" className="mt-2" title="Congratulations!">
                  It is recommended to request your reward! You might not get a second chance!
                </Alert>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Payouts — funded accounts only ── */}
      {!collapsed && account.phase === "funded" && f && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 px-4 py-2 pl-5">
            <button
              type="button"
              onClick={() => setShowPayouts(!showPayouts)}
              aria-expanded={showPayouts}
              className="group/t inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ChevronDown
                size={14}
                strokeWidth={2.25}
                aria-hidden="true"
                className={"transition-transform duration-200 ease-out " + (showPayouts ? "rotate-0" : "-rotate-90")}
              />
              <span>Payouts ({payouts.length})</span>
              {payouts.length > 0 && (
                <Badge variant="success" size="sm" className="ml-0.5">Total {money(m.totalPayouts)}</Badge>
              )}
            </button>
            <Button
              size="xs"
              variant="secondary"
              leftIcon={<Award size={11} strokeWidth={2.5} />}
              className="!border-emerald-200 !text-emerald-700 hover:!border-emerald-300 hover:!bg-emerald-50 dark:!border-emerald-900 dark:!text-emerald-400 dark:hover:!bg-emerald-950/40"
              onClick={() => setAddingPayout(true)}
            >
              Record Payout
            </Button>
          </div>

          {addingPayout && (
            <div className="px-4 pb-3 pl-5">
              <PayoutForm
                currentBalance={m.currentBal}
                firmData={f}
                onSave={handleAddPayout}
                onCancel={() => setAddingPayout(false)}
                payoutNumber={payouts.length + 1}
              />
            </div>
          )}

          {showPayouts && payouts.length > 0 && (
            <div className="overflow-x-auto px-4 pb-3 pl-5">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-right">Payout</th>
                    <th className="px-2 py-1.5 text-right">Net (after split)</th>
                    <th className="px-2 py-1.5 text-right">New Balance</th>
                    <th className="px-2 py-1.5 text-left">Notes</th>
                    <th className="w-8 px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...payouts].reverse().map(p => (
                    <tr key={p.id} className="transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20">
                      <td className="px-2 py-1.5 tabular-nums text-slate-600 dark:text-slate-400">{p.date}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(p.amount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{money(p.netAmount || p.amount)}</td>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">{money(p.newBalance)}</td>
                      <td className="max-w-[150px] truncate px-2 py-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">{p.notes || ""}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeletePayout(p.id)}
                          aria-label="Delete payout"
                          className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 text-[11.5px] font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <td className="px-2 py-1.5">Total ({payouts.length})</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {money(payouts.reduce((s, p) => s + (p.amount || 0), 0))}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {money(payouts.reduce((s, p) => s + (p.netAmount || p.amount || 0), 0))}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Reset — both phases ── */}
      {!collapsed && f && (!f.noResets || resets.length > 0) && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 px-4 py-2 pl-5">
            <button
              type="button"
              onClick={() => setShowResets(!showResets)}
              aria-expanded={showResets}
              className="group/t inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ChevronDown
                size={14}
                strokeWidth={2.25}
                aria-hidden="true"
                className={"transition-transform duration-200 ease-out " + (showResets ? "rotate-0" : "-rotate-90")}
              />
              <span>Resets ({resets.length})</span>
              {resets.length > 0 && (
                <Badge variant="warn" size="sm" className="ml-0.5">
                  Cost {money(resets.reduce((s, r) => s + (r.cost || 0), 0))}
                </Badge>
              )}
              {f.noResets && <span className="ml-1 text-[10.5px] text-slate-400 dark:text-slate-500">(firm has no reset option)</span>}
            </button>
            {!f.noResets && (
              <Button
                size="xs"
                variant="secondary"
                leftIcon={<RefreshCw size={11} strokeWidth={2.5} />}
                className="!border-amber-200 !text-amber-700 hover:!border-amber-300 hover:!bg-amber-50 dark:!border-amber-900 dark:!text-amber-400 dark:hover:!bg-amber-950/40"
                onClick={() => setAddingReset(true)}
              >
                Reset Account
              </Button>
            )}
          </div>

          {addingReset && (
            <div className="px-4 pb-3 pl-5">
              <ResetForm
                firmData={f}
                defaultCost={firmData?.resetPrice || 0}
                startBalance={account.startBalance || 50000}
                onSave={handleReset}
                onCancel={() => setAddingReset(false)}
              />
            </div>
          )}

          {showResets && resets.length > 0 && (
            <div className="overflow-x-auto px-4 pb-3 pl-5">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-right">Cost</th>
                    <th className="px-2 py-1.5 text-right">New Balance</th>
                    <th className="px-2 py-1.5 text-left">Notes</th>
                    <th className="w-8 px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...resets].reverse().map((r, i) => (
                    <tr key={r.id} className="transition-colors hover:bg-amber-50/50 dark:hover:bg-amber-950/20">
                      <td className="px-2 py-1.5 tabular-nums text-[11.5px] text-slate-400 dark:text-slate-500">{resets.length - i}</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600 dark:text-slate-400">{r.date}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-red-600 dark:text-red-400">{money(r.cost)}</td>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">{money(r.newBalance)}</td>
                      <td className="max-w-[150px] truncate px-2 py-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">{r.notes || ""}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteReset(r.id)}
                          aria-label="Delete reset"
                          className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 text-[11.5px] font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <td colSpan={2} className="px-2 py-1.5">Total ({resets.length} reset{resets.length !== 1 ? "s" : ""})</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">
                      {money(resets.reduce((s, r) => s + (r.cost || 0), 0))}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {resets.length > 0 && m.resetsToBreakeven != null && (
            <div className="px-4 pb-2 pl-5">
              <Alert variant={m.resetsToBreakeven > 0 ? "warn" : "danger"}>
                <b>Resets left to breakeven at current reset price ({money(firmData?.resetPrice || resets[resets.length - 1]?.cost || 0)}):</b>{" "}
                {m.resetsToBreakeven > 0 ? (
                  <span className="tabular-nums">{m.resetsToBreakeven}</span>
                ) : (
                  <span>Already exceeded — net loss from resets</span>
                )}
              </Alert>
            </div>
          )}
        </div>
      )}

      {/* ── Journal ── */}
      {!collapsed && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowJournal(!showJournal)}
            aria-expanded={showJournal}
            className="flex w-full items-center justify-between gap-2 px-4 py-2 pl-5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800/40"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown
                size={14}
                strokeWidth={2.25}
                aria-hidden="true"
                className={"transition-transform duration-200 ease-out " + (showJournal ? "rotate-0" : "-rotate-90")}
              />
              Trading Journal ({m.cycleEntries} entries{m.payoutCount > 0 ? ` in current cycle · ${m.allEntriesCount} total` : ""})
            </span>
          </button>
          {showJournal && (
            <div className="space-y-2 px-4 pb-3 pl-5">
              {/* Add / Import buttons */}
              {!addingEntry && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    leftIcon={<Plus size={11} strokeWidth={2.5} />}
                    className="!border-blue-200 !text-blue-700 hover:!border-blue-300 hover:!bg-blue-50 dark:!border-blue-900 dark:!text-blue-400 dark:hover:!bg-blue-950/40"
                    onClick={() => setAddingEntry(true)}
                  >
                    Log Today
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    leftIcon={<Upload size={11} strokeWidth={2.5} />}
                    className="!border-emerald-200 !text-emerald-700 hover:!border-emerald-300 hover:!bg-emerald-50 dark:!border-emerald-900 dark:!text-emerald-400 dark:hover:!bg-emerald-950/40"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import CSV
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleCsvImport} />
                </div>
              )}
              {importMsg && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  {importMsg}
                </div>
              )}
              {addingEntry && <JournalEntryForm onSave={handleAddEntry} onCancel={() => setAddingEntry(false)} />}

              {/* Journal table */}
              {entries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="px-2 py-1.5 text-left">Date</th>
                        <th className="px-2 py-1.5 text-right">Balance</th>
                        <th className="px-2 py-1.5 text-right">P&L</th>
                        <th className="px-2 py-1.5 text-right">Trades</th>
                        <th className="px-2 py-1.5 text-center">Flags</th>
                        <th className="px-2 py-1.5 text-left">Notes</th>
                        <th className="w-16 px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[...entries].reverse().map(e => {
                        const dd = m.dailyDetails?.find(d => d.date === e.date);
                        const flags = [];
                        if (dd?.dllBreach) flags.push({ icon: "DLL", variant: "danger", tip: "Daily loss limit exceeded" });
                        if (dd?.mllBreach) flags.push({ icon: "MLL", variant: "danger-solid", tip: "Max loss breached" });
                        if (m.biggestDayDate === e.date && m.consistencyAdjTarget > m.baseTarget) {
                          const tip = m.phase === "funded"
                            ? `This day is ${(m.consistencyPct * 100).toFixed(0)}% of total profit — DO NOT exceed this amount. Need more spread profit for payout eligibility.`
                            : `This day is ${(m.consistencyPct * 100).toFixed(0)}% of total profit — pushes target to ${money(m.consistencyAdjTarget)}`;
                          flags.push({ icon: `${(m.consistencyPct * 100).toFixed(0)}%`, variant: "warn", tip });
                        }
                        return editingEntry === e.id ? (
                          <tr key={e.id}><td colSpan={7}><JournalEntryForm initial={e} onSave={handleUpdateEntry} onCancel={() => setEditingEntry(null)} /></td></tr>
                        ) : (
                          <tr
                            key={e.id}
                            className={
                              "transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 " +
                              (dd?.dllBreach || dd?.mllBreach ? "bg-red-50/50 dark:bg-red-950/20" : "")
                            }
                          >
                            <td className="px-2 py-1.5 tabular-nums text-slate-600 dark:text-slate-400">{e.date}</td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">{money(e.balance)}</td>
                            {(() => {
                              const displayPnl = dd ? dd.pnl : (e.pnl || 0);
                              return (
                                <td
                                  className={
                                    "px-2 py-1.5 text-right font-semibold tabular-nums " +
                                    (displayPnl > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : displayPnl < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-slate-400 dark:text-slate-500")
                                  }
                                >
                                  {displayPnl > 0 ? "+" : ""}{money(displayPnl)}
                                </td>
                              );
                            })()}
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{e.trades || "—"}</td>
                            <td className="px-2 py-1.5 text-center">
                              {flags.length > 0 ? (
                                <div className="flex flex-wrap items-center justify-center gap-0.5">
                                  {flags.map((fl, i) => (
                                    <span
                                      key={i}
                                      title={fl.tip}
                                      className={
                                        "inline-flex h-4 items-center rounded px-1 text-[9.5px] font-bold tabular-nums " +
                                        (fl.variant === "danger-solid"
                                          ? "bg-red-600 text-white"
                                          : fl.variant === "danger"
                                          ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300")
                                      }
                                    >
                                      {fl.icon}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                            <td className="max-w-[200px] truncate px-2 py-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">{e.notes || ""}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => setEditingEntry(e.id)}
                                aria-label="Edit entry"
                                className="rounded p-1 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:text-slate-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(e.id)}
                                aria-label="Delete entry"
                                className="ml-0.5 rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Today's Plan stat tile ──
const PLAN_STAT_TONES = {
  slate:   "border-slate-200 dark:border-slate-700",
  emerald: "border-emerald-200 dark:border-emerald-800",
  red:     "border-red-200 dark:border-red-900",
};
const PLAN_STAT_CHIP_TONES = {
  slate:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  red:     "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400",
};
const PLAN_STAT_VAL_TONES = {
  slate:   "text-slate-900 dark:text-slate-100",
  emerald: "text-emerald-700 dark:text-emerald-400",
  red:     "text-red-600 dark:text-red-400",
};
function PlanStat({ tone = "slate", icon: Icon, label, value, sub, extra }) {
  return (
    <div className={"rounded-lg border bg-white p-2.5 text-center dark:bg-slate-900 " + PLAN_STAT_TONES[tone]}>
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span className={"inline-flex h-4 w-4 items-center justify-center rounded " + PLAN_STAT_CHIP_TONES[tone]} aria-hidden="true">
          <Icon size={10} strokeWidth={2.5} />
        </span>
        <span>{label}</span>
      </div>
      <div className={"mt-0.5 text-[17px] font-bold leading-tight tabular-nums " + PLAN_STAT_VAL_TONES[tone]}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums">{sub}</div>}
      {extra && <div className="mt-0.5 text-[10.5px] tabular-nums">{extra}</div>}
    </div>
  );
}

// ── Rule compliance row ──
const RULE_STATUS = {
  ok:      { Icon: CheckCircle2,  wrap: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" },
  caution: { Icon: AlertTriangle, wrap: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400" },
  warning: { Icon: AlertCircle,   wrap: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400" },
  breach:  { Icon: XCircle,       wrap: "bg-red-600 text-white" },
};
function RuleRow({ rule }) {
  const s = RULE_STATUS[rule.status] || RULE_STATUS.caution;
  const IconEl = s.Icon;
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className={"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full " + s.wrap}>
        <IconEl size={10} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="text-slate-700 dark:text-slate-300">
        <b className="font-semibold text-slate-900 dark:text-slate-100">{rule.label}:</b> {rule.detail}
      </span>
    </div>
  );
}

// New Account Form
// Split a single CSV into per-account CSVs (when rows contain different Account IDs/Names)
function splitCsvByAccount(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [csvText]; // nothing to split
  const hdr = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"/, "").replace(/"$/, ""));
  const nameIdx = hdr.findIndex(h => h === "account name" || h === "accountname" || h === "account_name" || h === "name");
  const acctIdIdx = hdr.findIndex(h => h === "account id" || h === "accountid" || h === "account_id");
  const keyIdx = nameIdx >= 0 ? nameIdx : acctIdIdx;
  if (keyIdx < 0) return [csvText]; // no account column, treat as single account
  const groups = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const key = (cols[keyIdx] || "unknown").trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(lines[i]);
  }
  const keys = Object.keys(groups);
  if (keys.length <= 1) return [csvText]; // single account
  return keys.map(k => lines[0] + "\n" + groups[k].join("\n"));
}

// Extract account name, start balance, start date from CSV text
function extractCsvAccountInfo(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return {};
  const hdr = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"/, "").replace(/"$/, ""));
  const nameIdx = hdr.findIndex(h => h === "account name" || h === "accountname" || h === "account_name" || h === "name");
  const acctIdIdx = hdr.findIndex(h => h === "account id" || h === "accountid" || h === "account_id");
  const firstRow = parseCsvRow(lines[1]);
  const name = nameIdx >= 0 ? firstRow[nameIdx] : (acctIdIdx >= 0 ? firstRow[acctIdIdx] : null);
  const balIdx = hdr.findIndex(h => h === "total amount" || h === "totalamount" || h === "total_amount" || h === "balance" || h === "eod_balance" || h === "equity");
  const pnlIdx = hdr.findIndex(h => h === "total realized pnl" || h === "totalrealizedpnl" || h === "total_realized_pnl" || h === "realized_pnl" || h === "daily_pnl" || h === "pnl");
  const dateIdx = hdr.findIndex(h => h === "trade date" || h === "tradedate" || h === "trade_date" || h === "date" || h.includes("timestamp"));
  let startBalance = null, startDate = null;
  if (balIdx >= 0 && pnlIdx >= 0) {
    startBalance = Math.round((parsePnlValue(firstRow[balIdx]) - parsePnlValue(firstRow[pnlIdx])) * 100) / 100;
  }
  if (dateIdx >= 0) startDate = parseTimestampDate(firstRow[dateIdx]);
  return { name: name || null, startBalance, startDate };
}

// Process one or more CSV texts into pending account objects
function processCsvTexts(csvTexts, defaultFirmId, defaultPhase) {
  const pending = [];
  for (const text of csvTexts) {
    // Split by account if the CSV has multiple accounts
    const parts = splitCsvByAccount(text);
    for (const part of parts) {
      const info = extractCsvAccountInfo(part);
      const baseBal = info.startBalance || 50000;
      const { entries, error, summary } = parseCsvToJournal(part, baseBal);
      pending.push({
        key: Date.now() + Math.random(),
        label: info.name || "",
        startBalance: info.startBalance || 50000,
        startDate: info.startDate || new Date().toISOString().slice(0, 10),
        firmId: defaultFirmId,
        phase: defaultPhase,
        journal: entries,
        entryCount: entries.length,
        summary: error ? `❌ ${error}` : summary,
        error: !!error,
      });
    }
  }
  return pending;
}

function NewAccountForm({ firms, onSave, onSaveBulk, onCancel }) {
  const defaultFirmId = firms.length > 0 ? firms[0].id : "";
  const [firmId, setFirmId] = useState(defaultFirmId);
  const [phase, setPhase] = useState("challenge");
  const [label, setLabel] = useState("");
  const [startBalance, setStartBalance] = useState(50000);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  // Single-account import (1 CSV, 1 account)
  const [importedJournal, setImportedJournal] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  // Bulk import (multiple accounts detected)
  const [bulkAccounts, setBulkAccounts] = useState(null);
  const fileInputRef = useRef(null);
  const selectedFirm = firms.find(f => f.id === Number(firmId));

  const handleCsvImport = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Read all files
    let loaded = 0;
    const texts = [];
    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        texts[idx] = ev.target.result;
        loaded++;
        if (loaded === files.length) {
          // All files loaded — process them
          const pending = processCsvTexts(texts, firmId, phase);
          if (pending.length === 0) {
            setImportMsg(`❌ ${t("alertNoValidData")}`);
          } else if (pending.length === 1 && !pending[0].error) {
            // Single account — use inline mode
            setBulkAccounts(null);
            const p = pending[0];
            if (p.label) setLabel(p.label);
            if (p.startBalance) setStartBalance(p.startBalance);
            if (p.startDate) setStartDate(p.startDate);
            setImportedJournal(p.journal);
            setImportMsg(`✅ ${p.summary}`);
          } else {
            // Multiple accounts — switch to bulk mode
            setImportedJournal(null);
            setImportMsg(null);
            setBulkAccounts(pending);
          }
        }
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  const updateBulkAccount = (key, field, value) => {
    setBulkAccounts(prev => prev.map(a => a.key === key ? { ...a, [field]: value } : a));
  };

  const removeBulkAccount = (key) => {
    setBulkAccounts(prev => {
      const next = prev.filter(a => a.key !== key);
      return next.length === 0 ? null : next;
    });
  };

  const handleBulkSave = () => {
    const valid = (bulkAccounts || []).filter(a => !a.error && a.firmId);
    if (valid.length === 0) { alert(t("alertNoValidAccounts")); return; }
    const accounts = valid.map(a => ({
      id: nextAccountId++,
      firmId: Number(a.firmId),
      phase: a.phase,
      label: a.label,
      startBalance: a.startBalance,
      startDate: a.startDate,
      journal: a.journal,
      status: "active",
    }));
    onSaveBulk(accounts);
  };

  const selectCls =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900 shadow-sm " +
    "transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const miniInputCls =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[12.5px] text-slate-900 shadow-sm " +
    "transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const miniLabelCls = "mb-0.5 block text-[10.5px] font-medium text-slate-500 dark:text-slate-400";

  // ── Bulk import mode ──
  if (bulkAccounts) {
    const validCount = bulkAccounts.filter(a => !a.error).length;
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <Upload size={12} strokeWidth={2.5} />
              </span>
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                {t("bulkImport", bulkAccounts.length)}
              </h3>
            </div>
            <p className="ml-[30px] text-[12px] text-slate-500 dark:text-slate-400">{t("assignFirm")}</p>
          </div>
          <Button
            size="xs"
            variant="secondary"
            leftIcon={<Upload size={11} strokeWidth={2.5} />}
            className="!border-blue-200 !text-blue-700 hover:!border-blue-300 hover:!bg-blue-50 dark:!border-blue-900 dark:!text-blue-400 dark:hover:!bg-blue-950/40"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("addMoreCsvs")}
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" multiple className="hidden" onChange={handleCsvImport} />
        </header>

        <div className="max-h-[420px] space-y-2 overflow-y-auto p-4">
          {bulkAccounts.map((a) => (
            <div
              key={a.key}
              className={
                "rounded-lg border p-3 transition-colors " +
                (a.error
                  ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
                  : "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40")
              }
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[160px] flex-1">
                  <label className={miniLabelCls}>{t("label")}</label>
                  <input
                    type="text"
                    className={miniInputCls}
                    value={a.label}
                    onChange={e => updateBulkAccount(a.key, "label", e.target.value)}
                    placeholder="Account name"
                  />
                </div>
                <div className="w-48">
                  <label className={miniLabelCls}>{t("firm")}</label>
                  <select
                    className={miniInputCls}
                    value={a.firmId}
                    onChange={e => updateBulkAccount(a.key, "firmId", e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {firms.map(f => <option key={f.id} value={f.id}>{f.name} — {f.model}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className={miniLabelCls}>{t("phase")}</label>
                  <select
                    className={miniInputCls}
                    value={a.phase}
                    onChange={e => updateBulkAccount(a.key, "phase", e.target.value)}
                  >
                    <option value="challenge">{t("challengeEval")}</option>
                    <option value="funded">{t("fundedPayout")}</option>
                  </select>
                </div>
                <div className="w-28">
                  <label className={miniLabelCls}>{t("startBal")}</label>
                  <input
                    type="number"
                    className={miniInputCls + " tabular-nums"}
                    value={a.startBalance}
                    onChange={e => updateBulkAccount(a.key, "startBalance", Number(e.target.value))}
                  />
                </div>
                <div className="w-32">
                  <label className={miniLabelCls}>{t("startDate")}</label>
                  <input
                    type="date"
                    className={miniInputCls}
                    value={a.startDate}
                    onChange={e => updateBulkAccount(a.key, "startDate", e.target.value)}
                  />
                </div>
                <div className="pt-4">
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${a.label || "account"}`}
                    size="icon-sm"
                    variant="ghost-danger"
                    onClick={() => removeBulkAccount(a.key)}
                  />
                </div>
              </div>
              <div className={"mt-1.5 text-[10.5px] " + (a.error ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400")}>
                {a.error ? a.summary : `${a.entryCount} journal entries · ${a.summary}`}
              </div>
            </div>
          ))}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <Button variant="ghost" size="sm" onClick={onCancel}>{t("cancel")}</Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={13} strokeWidth={2.5} />}
            onClick={handleBulkSave}
          >
            {t("importAccounts", validCount, validCount !== 1 ? "s" : "")}
          </Button>
        </footer>
      </div>
    );
  }

  // ── Single account mode ──
  const importBorderCls = importedJournal ? "!border-blue-400 !bg-blue-50/40 dark:!bg-blue-950/20" : "";
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
          >
            <Wallet size={14} strokeWidth={2.25} />
          </span>
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            {t("trackNewAccount")}
          </h3>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {/* CSV Quick-start */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-800 dark:text-blue-300">
                <Upload size={12} strokeWidth={2.5} aria-hidden="true" />
                {t("quickStartCsv")}
              </div>
              <div className="mt-0.5 text-[11px] text-blue-700/80 dark:text-blue-400/80">
                {t("csvImportDesc")}
              </div>
            </div>
            <Button
              size="xs"
              variant="secondary"
              leftIcon={<Upload size={11} strokeWidth={2.5} />}
              className="!border-blue-300 !text-blue-700 hover:!border-blue-400 hover:!bg-white dark:!border-blue-800 dark:!text-blue-300 dark:hover:!bg-slate-900"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("importCsvs")}
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" multiple className="hidden" onChange={handleCsvImport} />
          </div>
          {importMsg && (
            <div className="mt-2 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-700 dark:border-blue-900 dark:bg-slate-900 dark:text-slate-300">
              {importMsg}
            </div>
          )}
          {importedJournal && (
            <div className="mt-1 text-[10.5px] font-medium text-blue-700 dark:text-blue-400">
              {t("startTrackingEntries", importedJournal.length)}
            </div>
          )}
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={FIELD_LABEL_CLS}>{t("linkToFirm")}</label>
            <select
              className={selectCls}
              value={firmId}
              onChange={e => setFirmId(e.target.value)}
            >
              {firms.map(f => <option key={f.id} value={f.id}>{f.name} — {f.model}</option>)}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL_CLS}>{t("phase")}</label>
            {selectedFirm?.instant ? (
              <div className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                {t("fundedInstant")}
              </div>
            ) : (
              <select className={selectCls} value={phase} onChange={e => setPhase(e.target.value)}>
                <option value="challenge">{t("challengeEval")}</option>
                <option value="funded">{t("fundedPayout")}</option>
              </select>
            )}
          </div>
          <div>
            <label className={FIELD_LABEL_CLS}>
              {t("label")} {importedJournal && label ? "" : <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">(optional)</span>}
            </label>
            <input
              type="text"
              className={FIELD_INPUT_CLS + " " + importBorderCls}
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={selectedFirm ? `${selectedFirm.name} ${selectedFirm.model}` : "My account"}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLS}>{t("startBalance")}</label>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[13px] text-slate-400 dark:text-slate-500">$</span>
              <input
                type="number"
                className={FIELD_INPUT_CLS + " " + importBorderCls + " tabular-nums"}
                value={startBalance}
                onChange={e => setStartBalance(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label className={FIELD_LABEL_CLS}>{t("startDate")}</label>
            <input
              type="date"
              className={FIELD_INPUT_CLS + " " + importBorderCls}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel}>{t("cancel")}</Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={13} strokeWidth={2.5} />}
            onClick={() => {
              if (!firmId) { alert(t("alertSelectFirm")); return; }
              const effectivePhase = selectedFirm?.instant ? "funded" : phase;
              onSave({ id: nextAccountId++, firmId: Number(firmId), phase: effectivePhase, label, startBalance, startDate, journal: importedJournal || [], status: "active" });
            }}
          >
            {importedJournal ? t("startTrackingEntries", importedJournal.length) : t("startTracking")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FINANCIAL DASHBOARD
// ═══════════════════════════════════════════════════════════
function FinancialDashboard({ accounts, firms }) {
  const data = useMemo(() => {
    // ── Gather all financial events ──
    const events = []; // { date, type, firmId, firmName, amount, accountId, accountLabel }
    const firmMap = {};
    firms.forEach(f => { firmMap[f.id] = f; });

    accounts.forEach(acc => {
      const firm = firmMap[acc.firmId];
      if (!firm) return;
      const f = computeAll(firm);
      const label = acc.label || `${firm.name} ${firm.model}`;
      const firmName = `${firm.name} ${firm.model || ""}`.trim();

      // Expense: eval cost at account start date
      if (f.cost > 0) {
        events.push({ date: acc.startDate || "2026-01-01", type: "expense", category: "Eval Fee", firmId: acc.firmId, firmName, amount: f.cost, accountId: acc.id, accountLabel: label });
      }
      // Expense: activation fee (if account reached funded phase or started as funded)
      if (f.activation > 0 && acc.phase === "funded") {
        events.push({ date: acc.startDate || "2026-01-01", type: "expense", category: "Activation", firmId: acc.firmId, firmName, amount: f.activation, accountId: acc.id, accountLabel: label });
      }

      // Expense: resets
      (acc.resets || []).forEach(r => {
        if ((r.cost || 0) > 0) {
          events.push({ date: r.date || acc.startDate || "2026-01-01", type: "expense", category: "Reset Fee", firmId: acc.firmId, firmName, amount: r.cost, accountId: acc.id, accountLabel: label });
        }
      });

      // Income: payouts
      (acc.payouts || []).forEach(p => {
        events.push({ date: p.date, type: "income", category: "Payout", firmId: acc.firmId, firmName, amount: p.netAmount || p.amount || 0, accountId: acc.id, accountLabel: label });
      });
    });

    // ── Compute aggregates ──
    const totalExpenses = events.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);
    const totalIncome = events.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const actualPnl = totalIncome - totalExpenses;
    const actualRoi = totalExpenses > 0 ? actualPnl / totalExpenses : 0;
    const totalAccounts = accounts.length;
    const fundedAccounts = accounts.filter(a => a.phase === "funded").length;
    const accountsWithPayouts = new Set(events.filter(e => e.type === "income").map(e => e.accountId)).size;
    const totalResetCosts = events.filter(e => e.category === "Reset Fee").reduce((s, e) => s + e.amount, 0);
    const totalResets = events.filter(e => e.category === "Reset Fee").length;
    const payoutCount = events.filter(e => e.type === "income").length;
    const avgPayout = payoutCount > 0 ? totalIncome / payoutCount : 0;
    const costPerPayout = payoutCount > 0 ? totalExpenses / payoutCount : null;

    // ── By firm ──
    const byFirm = {};
    events.forEach(e => {
      if (!byFirm[e.firmName]) byFirm[e.firmName] = { firmName: e.firmName, firmId: e.firmId, expenses: 0, income: 0, accounts: new Set(), payouts: 0 };
      const b = byFirm[e.firmName];
      b.accounts.add(e.accountId);
      if (e.type === "expense") b.expenses += e.amount;
      if (e.type === "income") { b.income += e.amount; b.payouts++; }
    });
    const firmRows = Object.values(byFirm).map(b => ({
      ...b, accountCount: b.accounts.size,
      pnl: b.income - b.expenses,
      roi: b.expenses > 0 ? (b.income - b.expenses) / b.expenses : 0,
    })).sort((a, b) => b.pnl - a.pnl);

    // ── By month ──
    const byMonth = {};
    events.forEach(e => {
      const month = (e.date || "").slice(0, 7); // "YYYY-MM"
      if (!month || month.length < 7) return;
      if (!byMonth[month]) byMonth[month] = { month, expenses: 0, income: 0, payouts: 0 };
      if (e.type === "expense") byMonth[month].expenses += e.amount;
      if (e.type === "income") { byMonth[month].income += e.amount; byMonth[month].payouts++; }
    });
    const monthRows = Object.values(byMonth).map(b => ({
      ...b, pnl: b.income - b.expenses,
      roi: b.expenses > 0 ? (b.income - b.expenses) / b.expenses : 0,
    })).sort((a, b) => b.month.localeCompare(a.month));

    // ── By year ──
    const byYear = {};
    events.forEach(e => {
      const year = (e.date || "").slice(0, 4);
      if (!year || year.length < 4) return;
      if (!byYear[year]) byYear[year] = { year, expenses: 0, income: 0, payouts: 0 };
      if (e.type === "expense") byYear[year].expenses += e.amount;
      if (e.type === "income") { byYear[year].income += e.amount; byYear[year].payouts++; }
    });
    const yearRows = Object.values(byYear).map(b => ({
      ...b, pnl: b.income - b.expenses,
      roi: b.expenses > 0 ? (b.income - b.expenses) / b.expenses : 0,
    })).sort((a, b) => b.year.localeCompare(a.year));

    // ── Cumulative running total for break-even tracking ──
    const allEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));
    let cumulative = 0;
    const cumulativePnl = allEvents.map(e => {
      cumulative += e.type === "income" ? e.amount : -e.amount;
      return { date: e.date, cumPnl: cumulative, type: e.type };
    });

    return {
      totalExpenses, totalIncome, actualPnl, actualRoi,
      totalAccounts, fundedAccounts, accountsWithPayouts, payoutCount,
      avgPayout, costPerPayout, totalResetCosts, totalResets,
      firmRows, monthRows, yearRows, cumulativePnl,
    };
  }, [accounts, firms]);

  const pnlClr = v => v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400";
  const roiClr = v => v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500";
  const monthName = m => {
    try { const [y, mo] = m.split("-"); return new Date(y, mo - 1).toLocaleString("default", { month: "short", year: "numeric" }); } catch { return m; }
  };

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="No accounts yet"
        description="Start tracking accounts to see your financial dashboard."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header + Summary Cards ── */}
      <div className="space-y-3">
        <PageHeader
          title="Financial Dashboard"
          description="Real profits and losses across all accounts — eval fees, activations, resets, and payouts."
        />

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <DashKpi
            icon={TrendingDown}
            tone="red"
            label="Total Expenses"
            value={money(data.totalExpenses)}
            sub="eval fees + activations + resets"
          />
          <DashKpi
            icon={TrendingUp}
            tone="emerald"
            label="Total Income"
            value={money(data.totalIncome)}
            sub={`${data.payoutCount} payout${data.payoutCount !== 1 ? "s" : ""} · net after split`}
          />
          <DashKpi
            icon={Activity}
            tone={data.actualPnl >= 0 ? "emerald" : "red"}
            label="Actual P&L"
            value={
              <span className={pnlClr(data.actualPnl)}>
                {data.actualPnl >= 0 ? "+" : ""}{money(data.actualPnl)}
              </span>
            }
            sub="income − expenses"
            highlight
          />
          <DashKpi
            icon={BarChart3}
            tone={data.actualRoi >= 0 ? "emerald" : "red"}
            label="Actual ROI"
            value={
              <span className={roiClr(data.actualRoi)}>
                {data.actualRoi >= 0 ? "+" : ""}{(data.actualRoi * 100).toFixed(1)}%
              </span>
            }
            sub="P&L ÷ expenses"
          />
          <DashKpi
            icon={Award}
            tone="slate"
            label="Avg Payout"
            value={data.avgPayout > 0 ? money(data.avgPayout) : "—"}
            sub={data.costPerPayout != null ? `cost/payout: ${money(data.costPerPayout)}` : "no payouts yet"}
          />
        </div>

        {/* Secondary stats row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <DashChip label="Accounts" value={data.totalAccounts} />
          <DashChip label="Funded" value={data.fundedAccounts} />
          <DashChip label="Got payouts" value={data.accountsWithPayouts} tone={data.accountsWithPayouts > 0 ? "success" : "neutral"} />
          {data.totalResets > 0 && (
            <DashChip
              label="Resets"
              value={`${data.totalResets} (${money(data.totalResetCosts)})`}
              tone="warn"
            />
          )}
          <DashChip
            label="Success rate"
            value={`${data.totalAccounts > 0 ? ((data.accountsWithPayouts / data.totalAccounts) * 100).toFixed(0) : 0}%`}
            tone={data.accountsWithPayouts > 0 ? "success" : "neutral"}
          />
          {data.actualPnl < 0 && data.avgPayout > 0 && (
            <DashChip
              label="Break-even in"
              value={`${Math.ceil(Math.abs(data.actualPnl) / data.avgPayout)} more payout${Math.ceil(Math.abs(data.actualPnl) / data.avgPayout) !== 1 ? "s" : ""}`}
              tone="warn"
            />
          )}
        </div>
      </div>

      {/* ── By Firm ── */}
      {data.firmRows.length > 0 && (
        <DashTable title="By Firm" icon={Building2}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              <th className="px-3 py-2 text-left">Firm</th>
              <th className="px-3 py-2 text-right">Accounts</th>
              <th className="px-3 py-2 text-right">Expenses</th>
              <th className="px-3 py-2 text-right">Income</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2 text-right">ROI</th>
              <th className="px-3 py-2 text-right">Payouts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.firmRows.map(r => (
              <tr key={r.firmName} className="transition-colors duration-100 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{r.firmName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{r.accountCount}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{money(r.expenses)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.income)}</td>
                <td className={"px-3 py-2 text-right font-semibold tabular-nums " + pnlClr(r.pnl)}>
                  {r.pnl >= 0 ? "+" : ""}{money(r.pnl)}
                </td>
                <td className={"px-3 py-2 text-right tabular-nums " + roiClr(r.roi)}>
                  {r.expenses > 0 ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{r.payouts}</td>
              </tr>
            ))}
          </tbody>
          {data.firmRows.length > 1 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/70 text-[12px] font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totalAccounts}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{money(data.totalExpenses)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money(data.totalIncome)}</td>
                <td className={"px-3 py-2 text-right font-bold tabular-nums " + pnlClr(data.actualPnl)}>
                  {data.actualPnl >= 0 ? "+" : ""}{money(data.actualPnl)}
                </td>
                <td className={"px-3 py-2 text-right tabular-nums " + roiClr(data.actualRoi)}>
                  {data.totalExpenses > 0 ? `${data.actualRoi >= 0 ? "+" : ""}${(data.actualRoi * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{data.payoutCount}</td>
              </tr>
            </tfoot>
          )}
        </DashTable>
      )}

      {/* ── By Month ── */}
      {data.monthRows.length > 0 && (
        <DashTable title="By Month" icon={Clock}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              <th className="px-3 py-2 text-left">Month</th>
              <th className="px-3 py-2 text-right">Expenses</th>
              <th className="px-3 py-2 text-right">Income</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2 text-right">ROI</th>
              <th className="px-3 py-2 text-right">Payouts</th>
              <th className="px-3 py-2 text-right">Cumulative P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(() => {
              let cum = 0;
              return [...data.monthRows].reverse().map(r => {
                cum += r.pnl;
                return { ...r, cumPnl: cum };
              }).reverse().map(r => (
                <tr key={r.month} className="transition-colors duration-100 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{monthName(r.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                    {r.expenses > 0 ? money(r.expenses) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {r.income > 0 ? money(r.income) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                  </td>
                  <td className={"px-3 py-2 text-right font-semibold tabular-nums " + pnlClr(r.pnl)}>
                    {r.pnl >= 0 ? "+" : ""}{money(r.pnl)}
                  </td>
                  <td className={"px-3 py-2 text-right tabular-nums " + roiClr(r.roi)}>
                    {r.expenses > 0 ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}%` : <span className="text-slate-300 dark:text-slate-700">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {r.payouts > 0 ? r.payouts : <span className="text-slate-300 dark:text-slate-700">—</span>}
                  </td>
                  <td className={"px-3 py-2 text-right font-semibold tabular-nums " + pnlClr(r.cumPnl)}>
                    {r.cumPnl >= 0 ? "+" : ""}{money(r.cumPnl)}
                  </td>
                </tr>
              ));
            })()}
          </tbody>
          {(() => {
            const currentYear = new Date().getFullYear().toString();
            const ytdMonths = data.monthRows.filter(r => r.month.startsWith(currentYear));
            if (ytdMonths.length === 0) return null;
            const ytdExpenses = ytdMonths.reduce((s, r) => s + r.expenses, 0);
            const ytdIncome = ytdMonths.reduce((s, r) => s + r.income, 0);
            const ytdPnl = ytdIncome - ytdExpenses;
            const ytdRoi = ytdExpenses > 0 ? ytdPnl / ytdExpenses : 0;
            const ytdPayouts = ytdMonths.reduce((s, r) => s + r.payouts, 0);
            return (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-blue-50/60 text-[12px] font-bold text-slate-800 dark:border-slate-700 dark:bg-blue-950/30 dark:text-slate-200">
                  <td className="px-3 py-2.5">YTD {currentYear}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{ytdExpenses > 0 ? money(ytdExpenses) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{ytdIncome > 0 ? money(ytdIncome) : "—"}</td>
                  <td className={"px-3 py-2.5 text-right font-bold tabular-nums " + pnlClr(ytdPnl)}>
                    {ytdPnl >= 0 ? "+" : ""}{money(ytdPnl)}
                  </td>
                  <td className={"px-3 py-2.5 text-right tabular-nums " + roiClr(ytdRoi)}>
                    {ytdExpenses > 0 ? `${ytdRoi >= 0 ? "+" : ""}${(ytdRoi * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{ytdPayouts > 0 ? ytdPayouts : "—"}</td>
                  <td className={"px-3 py-2.5 text-right font-bold tabular-nums " + pnlClr(ytdPnl)}>
                    {ytdPnl >= 0 ? "+" : ""}{money(ytdPnl)}
                  </td>
                </tr>
              </tfoot>
            );
          })()}
        </DashTable>
      )}

      {/* ── By Year ── */}
      {data.yearRows.length > 0 && (
        <DashTable title="By Year" icon={Calculator}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              <th className="px-3 py-2 text-left">Year</th>
              <th className="px-3 py-2 text-right">Expenses</th>
              <th className="px-3 py-2 text-right">Income</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2 text-right">ROI</th>
              <th className="px-3 py-2 text-right">Payouts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.yearRows.map(r => (
              <tr key={r.year} className="transition-colors duration-100 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{r.year}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{money(r.expenses)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.income)}</td>
                <td className={"px-3 py-2 text-right font-semibold tabular-nums " + pnlClr(r.pnl)}>
                  {r.pnl >= 0 ? "+" : ""}{money(r.pnl)}
                </td>
                <td className={"px-3 py-2 text-right tabular-nums " + roiClr(r.roi)}>
                  {r.expenses > 0 ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{r.payouts}</td>
              </tr>
            ))}
          </tbody>
        </DashTable>
      )}
    </div>
  );
}

// ── Dashboard KPI card (hero row) — flat surface, no tinted icon chip. ──
// `tone` now only affects the value color. `highlight` adds a subtle accent
// on the primary P&L card so your eye lands on it first.
const DASH_KPI_ACCENT = {
  red:     "text-red-600 dark:text-red-400",
  emerald: "text-emerald-700 dark:text-emerald-400",
  slate:   "text-slate-900 dark:text-slate-100",
  blue:    "text-blue-700 dark:text-blue-400",
};
function DashKpi({ icon: Icon, tone = "slate", label, value, sub, highlight }) {
  const accent = DASH_KPI_ACCENT[tone] || DASH_KPI_ACCENT.slate;
  return (
    <div
      className={
        "rounded-lg border border-slate-200 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900 " +
        (highlight ? "ring-1 ring-blue-500/20 dark:ring-blue-500/25" : "")
      }
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.25} aria-hidden="true" className="text-slate-400 dark:text-slate-500" />}
        <span>{label}</span>
      </div>
      <div className={"mt-0.5 text-[22px] font-semibold leading-tight tabular-nums tracking-tight " + accent}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

// ── Dashboard chip (secondary stats) ──
const DASH_CHIP_TONES = {
  neutral: "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  success: "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  warn:    "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
};
function DashChip({ label, value, tone = "neutral" }) {
  const cls = DASH_CHIP_TONES[tone] || DASH_CHIP_TONES.neutral;
  return (
    <span className={"inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 text-[11.5px] " + cls}>
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

// ── Dashboard table wrapper (Card + header + scrollable table) ──
function DashTable({ title, icon: Icon, children }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        {Icon && (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          >
            <Icon size={12} strokeWidth={2.25} />
          </span>
        )}
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">{children}</table>
      </div>
    </div>
  );
}

// Account Tracker Tab
const getTrackerSortOpts = () => [
  { key: "newest", label: t("sortNewest") },
  { key: "oldest", label: t("sortOldest") },
  { key: "pnl_desc", label: t("sortPnlHigh") },
  { key: "pnl_asc", label: t("sortPnlLow") },
  { key: "progress_desc", label: t("sortProgress") },
  { key: "dd_asc", label: t("sortDdRisk") },
  { key: "ease_desc", label: t("sortLiveEase") },
];

// ═══════════════════════════════════════════════════════════
// UNIFIED DAILY OBJECTIVE — Trade Copier Card
// ═══════════════════════════════════════════════════════════
function calcUnifiedObjective(withMetrics) {
  // Partition: active (can trade today) vs excluded (breached/passed/no data)
  const active = withMetrics.filter(({ m }) =>
    m.todayPlan && !m.todayPlan.isBreached && !m.todayPlan.isTargetHit && m.todayPlan.idealDailyTarget > 0
  );
  const excluded = withMetrics.filter(({ m }) =>
    !m.todayPlan || m.todayPlan.isBreached || m.todayPlan.isTargetHit || m.todayPlan.idealDailyTarget <= 0
  );

  if (active.length === 0) {
    return { active: [], excluded, unified: null, warnings: [{ level: "critical", msg: "No accounts are eligible to trade today." }] };
  }

  const warnings = [];

  // Unified contracts = min across all active
  const unifiedContracts = Math.min(...active.map(({ m }) => m.todayPlan.contractsAllowed || 1));
  const reducedAccounts = active.filter(({ m }) => (m.todayPlan.contractsAllowed || 1) > unifiedContracts);
  if (reducedAccounts.length > 0) {
    warnings.push({ level: "info", msg: `Contracts reduced to ${unifiedContracts} (${reducedAccounts.length} account${reducedAccounts.length > 1 ? "s" : ""} could use more).` });
  }

  // Unified target: max(idealDailyTarget) capped at min(maxDailyProfit)
  const maxTarget = Math.max(...active.map(({ m }) => m.todayPlan.idealDailyTarget));
  const caps = active.map(({ m }) => m.todayPlan.maxDailyProfit).filter(c => c != null && c > 0);
  const minCap = caps.length > 0 ? Math.min(...caps) : Infinity;
  const hasConflict = maxTarget > minCap;
  const unifiedTarget = hasConflict ? minCap : maxTarget;

  if (hasConflict) {
    const capAccounts = active.filter(({ m }) => m.todayPlan.maxDailyProfit != null && m.todayPlan.maxDailyProfit === minCap);
    warnings.push({ level: "warning", msg: `Target capped at $${Math.round(minCap).toLocaleString()} (${capAccounts.map(({ acc }) => acc.label || acc.id).join(", ")} daily cap) — ${active.filter(({ m }) => m.todayPlan.idealDailyTarget > minCap).length} account(s) need more.` });
  }

  // Unified max daily loss = min across all
  const unifiedMaxLoss = Math.min(...active.map(({ m }) => m.todayPlan.maxDailyLoss));

  // Per-account impact: days at individual vs unified target
  const accountDetails = active.map(({ acc, firmData, m }) => {
    const remaining = m.remainingProfit || 0;
    const daysIndividual = m.todayPlan.minDaysToComplete || 1;
    const daysUnified = unifiedTarget > 0 ? Math.max(1, Math.ceil(remaining / unifiedTarget)) : daysIndividual;
    const diff = daysUnified - daysIndividual;
    let impact = null;
    if (diff > 0) impact = `+${diff} day${diff > 1 ? "s" : ""}`;
    else if (diff < 0) impact = `${diff} day${Math.abs(diff) > 1 ? "s" : ""}`;
    return { acc, firmData, m, daysIndividual, daysUnified, impact };
  });

  // Days impact warning
  const impacted = accountDetails.filter(d => d.impact && d.impact.startsWith("+"));
  if (impacted.length > 0) {
    warnings.push({ level: "warning", msg: `Unified target adds days for ${impacted.length} account(s).` });
  }

  // Group by firm
  const firmGroups = {};
  accountDetails.forEach(d => {
    const fname = d.firmData ? `${d.firmData.name} ${d.firmData.model || ""}`.trim() : "Unknown";
    if (!firmGroups[fname]) firmGroups[fname] = { active: 0, targets: [] };
    firmGroups[fname].active++;
    firmGroups[fname].targets.push(d.m.todayPlan.idealDailyTarget);
  });

  return {
    active: accountDetails,
    excluded,
    unified: { target: Math.round(unifiedTarget), contracts: unifiedContracts, maxLoss: unifiedMaxLoss, hasConflict },
    warnings,
    firmGroups,
  };
}

// ─── Warning severity config ────────────────────────────────────────────────
const WARN_CONFIG = {
  critical: {
    Icon: AlertCircle,
    iconClass: "text-red-600 dark:text-red-400",
    rowClass: "bg-red-50/70 border-red-200 dark:bg-red-950/30 dark:border-red-900",
    textClass: "text-red-800 dark:text-red-200",
    label: "Critical",
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: "text-amber-600 dark:text-amber-400",
    rowClass: "bg-amber-50/70 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
    textClass: "text-amber-900 dark:text-amber-200",
    label: "Warning",
  },
  info: {
    Icon: Info,
    iconClass: "text-sky-600 dark:text-sky-400",
    rowClass: "bg-sky-50/60 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900",
    textClass: "text-sky-900 dark:text-sky-200",
    label: "Info",
  },
};

// NQ futures — $20 per point per contract, 4 ticks per point
const NQ_POINT_VALUE = 20;
const roundTick = (v) => Math.round(v * 4) / 4;
const moneyAbs = (n) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

function UnifiedObjectiveCard({ withMetrics, firms }) {
  // ── Group filter state (null = All accounts, otherwise a firmId) ──
  const [groupFilter, setGroupFilter] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [nsExpanded, setNsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Build available group options from the firms represented in withMetrics
  const groupOptions = useMemo(() => {
    const byFirm = new Map();
    for (const { acc, firmData } of withMetrics) {
      const id = acc.firmId;
      if (!byFirm.has(id)) {
        const label = firmData ? `${firmData.name}${firmData.model ? " " + firmData.model : ""}`.trim() : `Firm #${id}`;
        byFirm.set(id, { firmId: id, label, count: 0 });
      }
      byFirm.get(id).count += 1;
    }
    return Array.from(byFirm.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [withMetrics, firms]);

  // Narrow metrics to the selected group (or show all)
  const scopedMetrics = useMemo(() => {
    if (groupFilter == null) return withMetrics;
    return withMetrics.filter(({ acc }) => acc.firmId === groupFilter);
  }, [withMetrics, groupFilter]);

  const result = useMemo(() => calcUnifiedObjective(scopedMetrics), [scopedMetrics]);
  const { unified, active, excluded, warnings, firmGroups } = result;

  const activeGroup = groupOptions.find(g => g.firmId === groupFilter) || null;
  const scopeLabel = activeGroup ? activeGroup.label : "All accounts";
  const profileName = activeGroup
    ? `${activeGroup.label.replace(/\s+/g, "-")}-group`
    : "Unified";

  // ── Empty state: no eligible accounts in the selected scope ──
  if (!unified) {
    return (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Always render the group selector so the user can switch away */}
        {groupOptions.length > 1 && (
          <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <GroupSelector
              options={groupOptions}
              allCount={withMetrics.length}
              value={groupFilter}
              onChange={setGroupFilter}
            />
          </div>
        )}
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-3 border-t border-red-200 bg-red-50 px-5 py-3 first:border-t-0 dark:border-red-900 dark:bg-red-950/40"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div className="text-sm">
            <div className="font-semibold text-red-900 dark:text-red-200">
              Trade Copier — No eligible accounts{activeGroup ? ` in ${activeGroup.label}` : ""}
            </div>
            <div className="mt-0.5 text-red-700 dark:text-red-300">
              {warnings[0]?.msg || "No accounts are eligible to trade today."}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const money = moneyAbs;  // local alias so existing money(...) calls below still work
  const totalAccounts = active.length + excluded.length;
  const panelId = "unified-obj-details";
  const nsPanelId = "unified-ns-params";

  // ── Derive NinjaScript parameters from the unified plan ──
  const nsContracts = unified.contracts || 1;
  const nsTpPoints = roundTick(unified.target / nsContracts / NQ_POINT_VALUE);
  const nsSlFixedPoints = unified.maxLoss > 0
    ? roundTick(unified.maxLoss / nsContracts / NQ_POINT_VALUE)
    : 0;
  const nsMaxDailyLoss = Math.round(Math.abs(unified.maxLoss || 0));

  const nsParams = [
    { key: "ProfileName",    label: "Profile name",      value: profileName,              hint: "Shown in NinjaTrader logs" },
    { key: "SessionMode",    label: "Session",           value: "NewYork",                hint: "NewYork | London | Both" },
    { key: "OpeningRange",   label: "Opening range (min)", value: "15",                   hint: "Standard 15-min OR" },
    { key: "Contracts",      label: "Contracts",         value: nsContracts,              hint: "min across accounts" },
    { key: "TpPoints",       label: "Take profit (pt)",  value: nsTpPoints,               hint: `target $${Math.round(unified.target).toLocaleString()} ÷ ${nsContracts} ÷ $${NQ_POINT_VALUE}` },
    { key: "SlMode",         label: "Stop loss mode",    value: "OrOpposite",             hint: "or: FixedPoints (see below)" },
    { key: "SlFixedPoints",  label: "SL fixed points",   value: nsSlFixedPoints,          hint: `max loss −${money(unified.maxLoss)} ÷ ${nsContracts} ÷ $${NQ_POINT_VALUE}` },
    { key: "MaxDailyLoss",   label: "Max daily loss",    value: nsMaxDailyLoss,           hint: "absolute $, positive" },
  ];

  const handleCopyParams = async () => {
    const text = nsParams.map(p => `${p.key.padEnd(18)} = ${p.value}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // Fallback for non-HTTPS contexts
      window.prompt("Copy NinjaScript parameters:", text);
    }
  };

  return (
    <section
      aria-labelledby="unified-obj-title"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* ── HEADER BAR ──────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 shadow-sm"
            aria-hidden="true"
          >
            <Zap size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h2
              id="unified-obj-title"
              className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100"
            >
              Trade Copier — Unified Daily Objective
            </h2>
            <p className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              {activeGroup
                ? <>Scoped to <span className="font-medium text-slate-700 dark:text-slate-300">{activeGroup.label}</span> · plan copies within this group only</>
                : "Single plan that copies across all accounts"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {unified.hasConflict && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <AlertTriangle size={11} strokeWidth={2.5} aria-hidden="true" />
              <span>Conflict</span>
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            aria-label={`${active.length} of ${totalAccounts} accounts active`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {active.length}/{totalAccounts} active
          </span>
        </div>
      </header>

      {/* ── GROUP SELECTOR (only if >1 firm represented) ──────── */}
      {groupOptions.length > 1 && (
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/30">
          <GroupSelector
            options={groupOptions}
            allCount={withMetrics.length}
            value={groupFilter}
            onChange={setGroupFilter}
          />
        </div>
      )}

      {/* ── HERO KPI ROW ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:divide-x md:divide-slate-100 md:dark:divide-slate-800">
        {/* Primary KPI — Daily Target */}
        <div className="relative bg-gradient-to-br from-emerald-50/60 to-white px-4 py-3 dark:from-emerald-950/20 dark:to-slate-900">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <Target size={11} strokeWidth={2.5} aria-hidden="true" />
            <span>Daily Target</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1 tabular-nums">
            <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">$</span>
            <span className="text-[24px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
              {Math.round(unified.target).toLocaleString()}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            per account · per day
          </div>
        </div>

        {/* Contracts */}
        <KpiCell
          icon={Layers}
          label="Contracts"
          value={unified.contracts}
          sub="min across accounts"
          tone="blue"
        />

        {/* Max Daily Loss */}
        <KpiCell
          icon={Shield}
          label="Max Loss"
          value={`−${money(unified.maxLoss)}`}
          sub="tightest limit"
          tone="red"
        />

        {/* Active Accounts */}
        <KpiCell
          icon={Users}
          label="Active"
          value={`${active.length}`}
          sub={`of ${totalAccounts} accounts`}
          tone="slate"
        />
      </div>

      {/* ── WARNINGS ────────────────────────────────────────────── */}
      {warnings.length > 0 && (
        <ul
          aria-label={`${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`}
          className="space-y-1.5 border-t border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40"
        >
          {warnings.map((w, i) => {
            const cfg = WARN_CONFIG[w.level] || WARN_CONFIG.info;
            const IconEl = cfg.Icon;
            return (
              <li
                key={i}
                className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-[12.5px] leading-snug ${cfg.rowClass}`}
              >
                <IconEl
                  size={14}
                  strokeWidth={2.25}
                  className={`mt-0.5 shrink-0 ${cfg.iconClass}`}
                  aria-hidden="true"
                />
                <div className={`flex-1 ${cfg.textClass}`}>
                  <span className="sr-only">{cfg.label}: </span>
                  {w.msg}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── EXPAND/COLLAPSE TRIGGER ─────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="group flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-[12px] font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200 dark:focus-visible:bg-slate-800/40"
      >
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          aria-hidden="true"
          className={`transition-transform duration-200 ease-out ${expanded ? "rotate-0" : "-rotate-90"}`}
        />
        <span>{expanded ? "Hide per-account breakdown" : "Show per-account breakdown"}</span>
      </button>

      {/* ── EXPANDED DETAILS ────────────────────────────────────── */}
      <div
        id={panelId}
        className={`grid overflow-hidden border-t border-slate-100 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none dark:border-slate-800 ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Firm summary chips */}
          {Object.keys(firmGroups).length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/40 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/30">
              {Object.entries(firmGroups).map(([name, g]) => {
                const minT = Math.min(...g.targets);
                const maxT = Math.max(...g.targets);
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                    <span className="text-slate-400 dark:text-slate-600">·</span>
                    <span className="text-slate-600 dark:text-slate-400">{g.active} acct{g.active !== 1 ? "s" : ""}</span>
                    <span className="text-slate-400 dark:text-slate-600">·</span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                      {money(minT)}
                      {minT !== maxT ? `–${money(maxT)}` : ""}/day
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Per-account table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  <th scope="col" className="px-4 py-2 text-left">Account</th>
                  <th scope="col" className="px-4 py-2 text-right">Own Target</th>
                  <th scope="col" className="px-4 py-2 text-right">Cap</th>
                  <th scope="col" className="px-4 py-2 text-right">Contracts</th>
                  <th scope="col" className="px-4 py-2 text-center">Days (own)</th>
                  <th scope="col" className="px-4 py-2 text-center">Days (unified)</th>
                  <th scope="col" className="px-4 py-2 text-left">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {active.map(({ acc, firmData, m, daysIndividual, daysUnified, impact }) => {
                  const isSlower = impact && impact.startsWith("+");
                  const isFaster = impact && impact.startsWith("-");
                  const ImpactIcon = isSlower ? TrendingDown : isFaster ? TrendingUp : Minus;
                  return (
                    <tr
                      key={acc.id}
                      className="transition-colors duration-100 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                            aria-label="active"
                          />
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {acc.label || acc.id}
                          </span>
                          {firmData && (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {firmData.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {money(m.todayPlan.idealDailyTarget)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {m.todayPlan.maxDailyProfit != null ? money(m.todayPlan.maxDailyProfit) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {m.todayPlan.contractsAllowed}
                      </td>
                      <td className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {daysIndividual}
                      </td>
                      <td className="px-4 py-2 text-center tabular-nums">
                        <span
                          className={
                            isSlower
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : isFaster
                              ? "font-semibold text-emerald-600 dark:text-emerald-400"
                              : "text-slate-700 dark:text-slate-300"
                          }
                        >
                          {daysUnified}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {impact ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                              isSlower
                                ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                            }`}
                          >
                            <ImpactIcon size={11} strokeWidth={2.5} aria-hidden="true" />
                            <span>{impact}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700" aria-label="no change">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {excluded.map(({ acc, m }) => {
                  const reason = m.todayPlan?.isBreached
                    ? "Breached"
                    : m.todayPlan?.isTargetHit
                    ? "Target hit"
                    : "Not eligible";
                  return (
                    <tr key={acc.id} className="opacity-60">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600"
                            aria-label="excluded"
                          />
                          <span className="font-medium text-slate-500 line-through decoration-slate-300 dark:text-slate-400 dark:decoration-slate-600">
                            {acc.label || acc.id}
                          </span>
                        </div>
                      </td>
                      <td colSpan={6} className="px-4 py-2 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                          <X size={10} strokeWidth={2.5} aria-hidden="true" />
                          {reason}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── NINJASCRIPT PARAMS TRIGGER ──────────────────────────── */}
      <button
        type="button"
        onClick={() => setNsExpanded(v => !v)}
        aria-expanded={nsExpanded}
        aria-controls={nsPanelId}
        className="group flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-[12px] font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200 dark:focus-visible:bg-slate-800/40"
      >
        <Code2
          size={13}
          strokeWidth={2.25}
          aria-hidden="true"
          className="text-slate-400 dark:text-slate-500"
        />
        <span>{nsExpanded ? "Hide NinjaScript parameters" : "Show NinjaScript parameters"}</span>
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          aria-hidden="true"
          className={`transition-transform duration-200 ease-out ${nsExpanded ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      {/* ── NINJASCRIPT PARAMS PANEL ────────────────────────────── */}
      <div
        id={nsPanelId}
        className={`grid overflow-hidden border-t border-slate-100 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none dark:border-slate-800 ${
          nsExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="bg-slate-50/60 px-5 py-4 dark:bg-slate-950/30">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <Code2 size={11} strokeWidth={2.5} aria-hidden="true" className="text-blue-600 dark:text-blue-400" />
                  UnifiedOrbStrategy inputs
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Paste these into NinjaTrader's strategy properties. Values are derived from the {scopeLabel.toLowerCase()} plan above.
                </p>
              </div>
              <Button
                size="xs"
                variant="secondary"
                leftIcon={copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
                onClick={handleCopyParams}
                aria-label="Copy NinjaScript parameters"
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {nsParams.map(p => (
                    <tr key={p.key}>
                      <td className="w-44 px-3 py-2 text-slate-500 dark:text-slate-400">
                        <div className="font-mono text-[11.5px] text-slate-700 dark:text-slate-300">{p.key}</div>
                        <div className="text-[10.5px] leading-tight text-slate-400 dark:text-slate-500">{p.label}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {p.value}
                      </td>
                      <td className="hidden px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 sm:table-cell">
                        {p.hint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <Info size={11} strokeWidth={2.5} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <div>
                Strategy file: <code className="hiw-code">ninjascript/UnifiedOrbStrategy.cs</code>. See the README
                there for setup and deployment guidance (Unified vs per-group master account routing via Tradesyncer).
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Group selector (segmented control used inside UnifiedObjectiveCard) ───
function GroupSelector({ options, allCount, value, onChange }) {
  const pillBase =
    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium " +
    "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
  const active =
    "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300";
  const inactive =
    "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800/60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Scope
      </span>
      <div role="tablist" aria-label="Account group filter" className="flex flex-wrap items-center gap-1.5">
        <button
          role="tab"
          aria-selected={value == null}
          type="button"
          onClick={() => onChange(null)}
          className={`${pillBase} ${value == null ? active : inactive}`}
        >
          <span>All</span>
          <span className={value == null ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}>
            {allCount}
          </span>
        </button>
        {options.map(opt => (
          <button
            key={opt.firmId}
            role="tab"
            aria-selected={value === opt.firmId}
            type="button"
            onClick={() => onChange(opt.firmId)}
            className={`${pillBase} ${value === opt.firmId ? active : inactive}`}
          >
            <span className="truncate max-w-[180px]">{opt.label}</span>
            <span className={value === opt.firmId ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}>
              {opt.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── KPI cell used in the hero row (flat, dense treatment) ────────────────
function KpiCell({ icon: Icon, label, value, sub, tone = "slate" }) {
  const accentMap = {
    blue:    "text-blue-600 dark:text-blue-400",
    red:     "text-red-600 dark:text-red-400",
    slate:   "text-slate-900 dark:text-slate-100",
    emerald: "text-emerald-700 dark:text-emerald-400",
  };
  const accent = accentMap[tone] || accentMap.slate;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.25} aria-hidden="true" className="text-slate-400 dark:text-slate-500" />}
        <span>{label}</span>
      </div>
      <div className={`mt-0.5 text-[22px] font-semibold tabular-nums leading-tight tracking-tight ${accent}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── Segmented pill-group filter — always-visible alternative to a dropdown.
// Used inside AccountTracker for the Type + Status filters. Value is a string
// key; onChange receives the new key. Non-`all` values are visually highlighted
// so an active filter is obvious at a glance.
function PillGroup({ label, value, onChange, options }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {label && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-label={label}
        className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/60"
      >
        {options.map(opt => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={
                "h-6 rounded px-2 text-[11.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (selected
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountTracker({ accounts, onUpdate, firms }) {
  const [adding, setAdding] = useState(false);
  // Default to all-collapsed so the list is scannable at a glance. Each collapsed
  // card shows ~40px of info (label + 3 KPIs). Users expand only what they need.
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(accounts.map(a => a.id)));
  // Track seen account ids — any account added after first mount starts expanded
  // (so the "Just tracked" flow still shows details immediately).
  const seenIdsRef = useRef(new Set(accounts.map(a => a.id)));
  useEffect(() => {
    const currentIds = new Set(accounts.map(a => a.id));
    // Newly-seen ids: don't add to collapsedIds so they render expanded.
    currentIds.forEach(id => { if (!seenIdsRef.current.has(id)) seenIdsRef.current.add(id); });
  }, [accounts]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  // Two independent, always-visible filters: account type (phase) and live status.
  // filterPhase:  all | challenge | funded
  // filterStatus: all | active | breached   (target-hit accounts count as "active")
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey, setSortKey] = useState("newest");

  const toggleCollapse = (id) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedIds(new Set(accounts.map(a => a.id)));
  };
  const expandAll = () => setCollapsedIds(new Set());
  const allCollapsed = accounts.length > 0 && accounts.every(a => collapsedIds.has(a.id));

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSaveAccount = (account) => {
    onUpdate(prev => [...prev, account]);
    setAdding(false);
  };

  const handleSaveBulk = (accs) => {
    onUpdate(prev => [...prev, ...accs]);
    setAdding(false);
  };

  const handleUpdateAccount = (updated) => {
    onUpdate(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const handleDeleteAccount = (id) => {
    if (!confirm(t("alertDeleteAccount"))) return;
    onUpdate(prev => prev.filter(a => a.id !== id));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t("alertDeleteSelected", selectedIds.size))) return;
    onUpdate(prev => prev.filter(a => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
  };

  // Archive = soft delete. The row is hidden from the main list + filters, but
  // its payouts/expenses still feed the Dashboard (FinancialDashboard iterates
  // all accounts regardless of status).
  const handleArchiveAccount = (id) => {
    onUpdate(prev => prev.map(a => a.id === id ? { ...a, status: "archived" } : a));
  };

  const handleArchiveSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t("alertArchiveSelected", selectedIds.size))) return;
    onUpdate(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, status: "archived" } : a));
    setSelectedIds(new Set());
  };

  const activeAccounts = accounts.filter(a => a.status !== "archived");
  const archivedAccounts = accounts.filter(a => a.status === "archived");

  // Compute metrics for filtering/sorting (memoize-ish)
  const withMetrics = useMemo(() => activeAccounts.map(acc => {
    const firmData = firms.find(f => f.id === acc.firmId);
    const m = calcLiveMetrics(acc, firmData);
    return { acc, firmData, m };
  }), [activeAccounts, firms]);

  // Stable key of currently-breached account ids — only changes when the *set*
  // of breached ids changes, not on every render. Keeps the auto-archive effect
  // below from firing on each re-render.
  const breachedIdsKey = useMemo(() => {
    return withMetrics
      .filter(({ m }) => m.mllBreached || m.ddPct <= 0)
      .map(({ acc }) => acc.id)
      .sort((a, b) => a - b)
      .join(",");
  }, [withMetrics]);

  // Auto-archive breached accounts — they no longer need live tracking but their
  // history must persist for the Dashboard (FinancialDashboard iterates all
  // accounts regardless of status).
  useEffect(() => {
    if (!breachedIdsKey) return;
    const ids = new Set(breachedIdsKey.split(",").map(Number));
    onUpdate(prev => prev.map(a => ids.has(a.id) && a.status !== "archived" ? { ...a, status: "archived" } : a));
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      ids.forEach(id => { if (next.delete(id)) changed = true; });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breachedIdsKey]);

  // Filter
  const filtered = useMemo(() => {
    let list = withMetrics;
    // Search — match label, firm name, firm model
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ acc, firmData }) => {
        const label = (acc.label || "").toLowerCase();
        const firm = firmData ? `${firmData.name} ${firmData.model}`.toLowerCase() : "";
        return label.includes(q) || firm.includes(q);
      });
    }
    // Phase filter
    if (filterPhase !== "all") {
      list = list.filter(({ acc }) => acc.phase === filterPhase);
    }
    // Status filter
    if (filterStatus !== "all") {
      list = list.filter(({ m }) => {
        if (filterStatus === "breached") return m.mllBreached || m.ddPct <= 0;
        // "Active" = anything not breached. Target-hit / payout-ready accounts
        // are still active until the user either takes payout or archives them.
        if (filterStatus === "active") return !m.mllBreached && m.ddPct > 0;
        return true;
      });
    }
    return list;
  }, [withMetrics, search, filterPhase, filterStatus]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortKey) {
      case "oldest": list.sort((a, b) => (a.acc.startDate || "").localeCompare(b.acc.startDate || "")); break;
      case "newest": list.sort((a, b) => (b.acc.startDate || "").localeCompare(a.acc.startDate || "")); break;
      case "pnl_desc": list.sort((a, b) => (b.m.totalPnl || 0) - (a.m.totalPnl || 0)); break;
      case "pnl_asc": list.sort((a, b) => (a.m.totalPnl || 0) - (b.m.totalPnl || 0)); break;
      case "progress_desc": list.sort((a, b) => (b.m.pctComplete || 0) - (a.m.pctComplete || 0)); break;
      case "dd_asc": list.sort((a, b) => (a.m.ddPct || 0) - (b.m.ddPct || 0)); break;
      case "ease_desc": list.sort((a, b) => ((b.m.liveEase || 0) - (a.m.liveEase || 0))); break;
      default: break;
    }
    return list;
  }, [filtered, sortKey]);

  const filtersActive = search || filterPhase !== "all" || filterStatus !== "all";

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("trackAccount")}
        description={t("clickTrackAccount")}
        actions={!adding && (
          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus size={14} strokeWidth={2.5} />}
            onClick={() => setAdding(true)}
          >
            {t("trackNewAccount")}
          </Button>
        )}
      />

      {adding && <NewAccountForm firms={firms} onSave={handleSaveAccount} onSaveBulk={handleSaveBulk} onCancel={() => setAdding(false)} />}

      {/* ── Search / Filter / Sort toolbar ── */}
      {activeAccounts.length > 0 && (() => {
        const visibleIds = sorted.map(s => s.acc.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
        const someSelected = selectedIds.size > 0;
        const selectCls =
          "h-8 appearance-none rounded-md border border-slate-300 bg-white pl-2.5 pr-7 text-[12.5px] text-slate-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
        return (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              {/* Select all */}
              <label
                className="flex shrink-0 cursor-pointer items-center gap-1.5 px-0.5"
                title={allVisibleSelected ? "Deselect all" : "Select all shown"}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-blue-600"
                  checked={allVisibleSelected}
                  onChange={() => {
                    if (allVisibleSelected) {
                      setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.delete(id)); return next; });
                    } else {
                      setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.add(id)); return next; });
                    }
                  }}
                />
              </label>
              {/* Search with icon */}
              <div className="relative min-w-[200px] flex-1">
                <Search
                  size={13}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  type="text"
                  className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder={t("searchAccounts")}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  aria-label={t("searchAccounts")}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {/* Type filter — always-visible segmented pills */}
              <PillGroup
                label={t("filterTypeLabel")}
                value={filterPhase}
                onChange={setFilterPhase}
                options={[
                  { value: "all",       label: t("all") },
                  { value: "challenge", label: t("challenge") },
                  { value: "funded",    label: t("funded") },
                ]}
              />
              {/* Status filter — always-visible segmented pills */}
              <PillGroup
                label={t("filterStatusLabel")}
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: "all",      label: t("all") },
                  { value: "active",   label: t("active") },
                  { value: "breached", label: t("breached") },
                ]}
              />
              {/* Sort */}
              <div className="relative shrink-0">
                <select className={selectCls} value={sortKey} onChange={e => setSortKey(e.target.value)} aria-label="Sort">
                  {getTrackerSortOpts().map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <ArrowDownWideNarrow size={12} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              {/* Collapse/Expand */}
              <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-slate-200 pl-2 dark:border-slate-800">
                <Button
                  size="xs"
                  variant="ghost"
                  leftIcon={allCollapsed ? <Eye size={11} strokeWidth={2.5} /> : <EyeOff size={11} strokeWidth={2.5} />}
                  onClick={allCollapsed ? expandAll : collapseAll}
                  title={allCollapsed ? t("expandAll") : t("collapseAll")}
                >
                  {allCollapsed ? t("expandAll") : t("collapseAll")}
                </Button>
              </div>
              {/* Result count */}
              {filtersActive && (
                <Badge variant="neutral" size="sm" className="shrink-0">
                  {sorted.length}/{activeAccounts.length} shown
                </Badge>
              )}
            </div>

            {/* Selection action bar */}
            {someSelected && (
              <div className="flex items-center gap-3 border-t border-blue-200 bg-blue-50 px-3 py-1.5 dark:border-blue-900 dark:bg-blue-950/40">
                <Badge variant="accent" size="sm">{selectedIds.size} selected</Badge>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[11.5px] font-medium text-blue-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
                >
                  {t("deselectAll")}
                </button>
                <div className="flex-1" />
                <Button
                  size="xs"
                  variant="secondary"
                  leftIcon={<Archive size={11} strokeWidth={2.5} />}
                  onClick={handleArchiveSelected}
                >
                  {t("archiveSelected")}
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  leftIcon={<Trash2 size={11} strokeWidth={2.5} />}
                  className="!border-red-200 !text-red-700 hover:!border-red-300 hover:!bg-red-50 dark:!border-red-900 dark:!text-red-400 dark:hover:!bg-red-950/40"
                  onClick={handleDeleteSelected}
                >
                  {t("deleteSelected")}
                </Button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Unified Trade Copier Objective ── */}
      {withMetrics.length >= 2 && (
        <UnifiedObjectiveCard withMetrics={withMetrics} firms={firms} />
      )}

      {activeAccounts.length === 0 && !adding && (
        <EmptyState
          icon={Wallet}
          title={t("noAccountsYet")}
          description={t("clickTrackAccount")}
          action={<Button variant="primary" size="sm" leftIcon={<Plus size={14} strokeWidth={2.5} />} onClick={() => setAdding(true)}>{t("trackNewAccount")}</Button>}
        />
      )}

      {sorted.length === 0 && activeAccounts.length > 0 && !adding && (
        <div className="py-8 text-center text-[13px] text-slate-400 dark:text-slate-500">
          {t("noAccountsMatch")}
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(({ acc, firmData }) => (
          <AccountCard
            key={acc.id}
            account={acc}
            firmData={firmData}
            onUpdate={handleUpdateAccount}
            onDelete={handleDeleteAccount}
            collapsed={collapsedIds.has(acc.id)}
            onToggleCollapse={() => toggleCollapse(acc.id)}
            selected={selectedIds.has(acc.id)}
            onToggleSelect={() => toggleSelect(acc.id)}
          />
        ))}
      </div>

      {archivedAccounts.length > 0 && (
        <details className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <summary className="cursor-pointer text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            Archived accounts ({archivedAccounts.length})
          </summary>
          <div className="mt-3 space-y-3 opacity-70">
            {archivedAccounts.map(acc => {
              const firmData = firms.find(f => f.id === acc.firmId);
              return (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  firmData={firmData}
                  onUpdate={handleUpdateAccount}
                  onDelete={handleDeleteAccount}
                  collapsed={collapsedIds.has(acc.id)}
                  onToggleCollapse={() => toggleCollapse(acc.id)}
                />
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INLINE AUTH (shown as a tab for unauthenticated users)
// ═══════════════════════════════════════════════════════════
function AuthInline() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const doAuth = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setSuccessMessage(t("authCheckEmail"));
        setEmail(""); setPassword("");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        // Session change is picked up by onAuthStateChange in main.jsx
      }
    } catch (err) {
      setError(err.message || t("authError"));
    } finally {
      setLoading(false);
    }
  };

  const doGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || t("authError"));
      setLoading(false);
    }
  };

  const inputCls =
    "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-[14px] text-slate-900 shadow-sm " +
    "transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 " +
    "disabled:opacity-50 disabled:cursor-not-allowed " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="mx-auto mt-8 max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-soft-md dark:border-slate-800 dark:bg-slate-900">
        {/* Brand lockup */}
        <div className="mb-5 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 shadow-soft"
          >
            <Lock size={17} strokeWidth={2.25} className="text-white" />
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("authRequiredTitle")}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            {t("authRequiredDesc")}
          </p>
        </div>

        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
        {successMessage && <Alert variant="success" className="mb-4">{successMessage}</Alert>}

        <form onSubmit={doAuth} className="space-y-3.5">
          <div>
            <label htmlFor="auth-email" className="mb-1 block text-[12px] font-medium text-slate-700 dark:text-slate-300">
              {t("authEmail")}
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
              className={inputCls}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1 block text-[12px] font-medium text-slate-700 dark:text-slate-300">
              {t("authPassword")}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-4 w-full">
            {isSignUp ? t("authSignUpBtn") : t("authSignInBtn")}
          </Button>
        </form>

        {/* Divider */}
        <div className="mt-5 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="text-[11.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t("authOr")}
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <Button
          variant="secondary"
          size="lg"
          onClick={doGoogle}
          disabled={loading}
          className="mt-4 w-full"
          leftIcon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          }
        >
          {t("authGoogleBtn")}
        </Button>

        <p className="mt-6 text-center text-[12.5px] text-slate-500 dark:text-slate-400">
          {isSignUp ? t("authToggleSignIn") : t("authToggleSignUp")}
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccessMessage(""); }}
            className="ml-1.5 font-semibold text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isSignUp ? t("authSignIn") : t("authSignUp")}
          </button>
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════
function AdminPanel({ getAdminUsers, addAdminUser, removeAdminUser, currentUserId }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    setLoading(true);
    const data = await getAdminUsers();
    setAdmins(data);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!newEmail.trim()) return;

    // Look up user by email via Supabase admin_users + auth
    // Since we can't query auth.users from client, we'll use a workaround:
    // The admin enters a user_id directly or email. We try to find via a lookup.
    // Try to find user by email in a helper RPC or just use the email directly
    // For now, we'll attempt to sign in to get the user id — actually, we should
    // add a Supabase RPC function for this. Let's use a simpler approach:
    // Admin enters the UUID directly, or we provide a lookup mechanism.

    // Simple approach: try to find if there's a user with this email who has preferences/accounts
    // Actually the cleanest approach: use Supabase's admin API or an RPC function.
    // For MVP, accept email and do a lookup via a database function.

    // Let's try using a custom RPC to look up user by email
    try {
      const { data: userData, error: lookupError } = await supabase.rpc("lookup_user_by_email", { target_email: newEmail.trim() });
      if (lookupError || !userData) {
        setError(t("adminUserNotFound"));
        return;
      }

      const targetUserId = userData;
      const result = await addAdminUser(targetUserId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(t("adminUserAdded"));
        setNewEmail("");
        await loadAdmins();
      }
    } catch (err) {
      setError(err.message || t("adminUserNotFound"));
    }
  }

  async function handleRemove(adminUserId) {
    if (!confirm(t("adminConfirmRemove"))) return;
    const result = await removeAdminUser(adminUserId);
    if (result.error) {
      setError(result.error);
    } else {
      await loadAdmins();
    }
  }

  return (
    <div className="mx-auto mt-2 max-w-2xl">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
            >
              <Shield size={15} strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {t("adminTitle")}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                Manage users with admin privileges.
              </p>
            </div>
          </div>
          <Badge variant="info" size="sm">
            {admins.length} {admins.length === 1 ? "admin" : "admins"}
          </Badge>
        </div>

        <div className="space-y-4 p-5">
          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          {/* Add admin form */}
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder={t("adminEmailPlaceholder")}
              aria-label={t("adminEmailPlaceholder")}
              className="h-9 min-w-[200px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={<UserPlus size={14} strokeWidth={2.5} />}
            >
              {t("adminAdd")}
            </Button>
          </form>

          {/* Admin list */}
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-[13px] text-slate-500 dark:text-slate-400">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {t("loading")}...
            </div>
          ) : admins.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No admins yet"
              description="Add a user above to grant admin privileges."
            />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {admins.map(admin => {
                const isYou = admin.user_id === currentUserId;
                return (
                  <li
                    key={admin.id}
                    className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      >
                        <Users size={13} strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-mono text-[12px] text-slate-700 dark:text-slate-300">
                            {admin.user_id}
                          </span>
                          {isYou && <Badge variant="info" size="sm">{t("adminYou")}</Badge>}
                        </div>
                      </div>
                    </div>
                    {!isYou && (
                      <Button
                        variant="ghost-danger"
                        size="xs"
                        leftIcon={<UserMinus size={12} strokeWidth={2.5} />}
                        onClick={() => handleRemove(admin.user_id)}
                      >
                        {t("adminRemove")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App({ session, onSignOut }) {
  const userId = session?.user?.id || null;
  const userEmail = session?.user?.email || null;

  // ── Supabase data layer ──
  const {
    firms, setFirms, saveFirm: saveFirmToDb, deleteFirm: deleteFirmFromDb,
    accounts, setAccounts, saveAccount: saveAccountToDb, deleteAccount: deleteAccountFromDb,
    preferences, savePreferences, loading: dataLoading, isAdmin,
    getAdminUsers, addAdminUser, removeAdminUser,
  } = useSupabaseData(session);

  // Sync nextId counters from loaded data
  useEffect(() => {
    if (firms.length > 0) nextId = Math.max(...firms.map(f => f.id || 0)) + 1;
  }, [firms]);
  useEffect(() => {
    if (accounts.length > 0) nextAccountId = Math.max(...accounts.map(a => a.id || 0)) + 1;
  }, [accounts]);

  const [editing, setEditing] = useState(null);
  const [sortBy, setSortBy] = useState("overallEase");
  const [showGuide, setShowGuide] = useState(false);
  const [tab, setTab] = useState("compare");
  const [focusFirmId, setFocusFirmId] = useState(null);
  const [darkMode, setDarkMode] = useState(preferences.darkMode);
  const [lang, setLangState] = useState(preferences.lang || getLang());

  // Sync preferences when they load from Supabase
  useEffect(() => {
    setDarkMode(preferences.darkMode);
    if (preferences.lang) {
      setLang(preferences.lang);
      setLangState(preferences.lang);
    }
  }, [preferences]);

  const toggleLang = () => {
    const next = lang === "en" ? "ro" : "en";
    setLang(next);
    setLangState(next);
    savePreferences({ ...preferences, darkMode, lang: next });
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    savePreferences({ darkMode, lang });
  }, [darkMode]);

  const computed = useMemo(() => {
    const opts = getSortOpts();
    const cols = getTableCols();
    const opt = opts.find(o => o.key === sortBy) || opts[0];
    // Also check TABLE_COLS for sort direction
    const tCol = cols.find(c => c.key === sortBy);
    const desc = tCol ? tCol.desc : (opt ? opt.desc : true);
    return firms.map(computeAll).sort((a, b) => {
      const av = a[sortBy] ?? (desc ? -Infinity : Infinity);
      const bv = b[sortBy] ?? (desc ? -Infinity : Infinity);
      return desc ? bv - av : av - bv;
    });
  }, [firms, sortBy]);

  const handleSave = async (firm) => {
    await saveFirmToDb(firm);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (confirm(t("alertDeleteFirm"))) await deleteFirmFromDb(id);
  };

  const handleFirmClick = (id) => {
    setFocusFirmId(id);
    setTab("details");
  };

  const best = computed[0];

  // Scroll to focused firm when switching to details
  useEffect(() => {
    if (tab === "details" && focusFirmId != null) {
      setTimeout(() => {
        const el = document.getElementById(`firm-${focusFirmId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFocusFirmId(null);
      }, 100);
    }
  }, [tab, focusFirmId]);

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Loading your data…
        </div>
      </div>
    );
  }

  // ── Tab definitions ──────────────────────────────────────
  const activeAccountsCount = accounts.filter(a => a.status !== "archived").length;
  const tabDefs = [
    { key: "compare",   label: t("tabComparison"), shortLabel: t("tabComparisonShort"), icon: BarChart3 },
    { key: "details",   label: t("tabDetails"),    shortLabel: t("tabDetailsShort"),    icon: Building2 },
    {
      key: "tracker",
      label: t("tabTracker"),
      shortLabel: t("tabTrackerShort"),
      icon: session ? Briefcase : Lock,
      badge: session && activeAccountsCount > 0 ? activeAccountsCount : undefined,
      gated: !session,
    },
    { key: "dashboard", label: t("tabDashboard"), shortLabel: t("tabDashboardShort"), icon: session ? LineChart : Lock, gated: !session },
    { key: "metrics",   label: t("tabMetrics"),   shortLabel: t("tabMetricsShort"),   icon: BookOpen },
    ...(session && isAdmin ? [{ key: "admin", label: t("tabAdmin"), shortLabel: t("tabAdminShort"), icon: Shield }] : []),
  ];
  const handleTabChange = (key) => {
    const def = tabDefs.find(d => d.key === key);
    if (def?.gated) setTab("login");
    else setTab(key);
  };

  // Controls that live in the top-right of the app shell (lang / theme / auth / admin).
  // Rendered identically on desktop and mobile; sidebar is nav-only.
  const shellActions = (
    <>
      <button
        onClick={toggleLang}
        title={lang === "en" ? "Schimbă în Română" : "Switch to English"}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <Globe size={13} strokeWidth={2.25} />
        {lang === "en" ? "RO" : "EN"}
      </button>
      <IconButton
        icon={darkMode ? Sun : Moon}
        label={darkMode ? t("lightMode") : t("darkMode")}
        size="icon-sm"
        onClick={() => setDarkMode(d => !d)}
      />
      {session && isAdmin && (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus size={14} strokeWidth={2.5} />}
          onClick={() => setEditing({})}
          className="ml-1"
        >
          {t("addFirm")}
        </Button>
      )}
      {session ? (
        <IconButton
          icon={LogOut}
          label={t("authSignOut")}
          size="icon-sm"
          variant="ghost-danger"
          onClick={onSignOut}
        />
      ) : (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<LogIn size={14} strokeWidth={2.5} />}
          onClick={() => setTab("login")}
          className="ml-1"
        >
          {t("authSignIn")}
        </Button>
      )}
    </>
  );

  return (
    <AppShell
      navItems={tabDefs}
      activeKey={tab === "login" ? null : tab}
      onSelect={handleTabChange}
      brand={{ icon: Award, title: t("appTitle"), subtitle: t("appSubtitle", firms.length) }}
      topBarActions={shellActions}
    >
      {/* ── TOP PICK BANNER ── */}
      {best && tab === "compare" && (
        <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50/60 via-white to-white dark:border-slate-800 dark:from-amber-950/20 dark:via-slate-950 dark:to-slate-950">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-[13px] sm:px-6">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              <Trophy size={14} className="text-amber-500" strokeWidth={2.25} aria-hidden="true" />
              {t("topPick")}
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{best.name}</span>
            <Badge variant="success" size="sm">
              {pct(best.overallEase)} {t("overallEase")}
            </Badge>
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <TrendingUp size={12} strokeWidth={2.25} aria-hidden="true" className="text-emerald-500" />
              <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">{money(best.maxNetProfit)}</span>
              <span className="text-slate-500 dark:text-slate-500">{t("maxProfit")}</span>
            </span>
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">{money(best.totalCost)}</span>
              <span className="text-slate-500 dark:text-slate-500">{t("cost")}</span>
            </span>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT ── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === "compare" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                {t("clickToSort")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="success" size="sm" dot>{t("easeGreen")}</Badge>
                <Badge variant="warn" size="sm" dot>{t("easeAmber")}</Badge>
                <Badge variant="danger" size="sm" dot>{t("easeRed")}</Badge>
              </div>
            </div>
            <ComparisonTable firms={computed} sortKey={sortBy} onSort={setSortBy} onFirmClick={handleFirmClick} />
            <HowItWorks open={showGuide} onToggle={() => setShowGuide(!showGuide)} />
          </div>
        )}

        {tab === "details" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="firm-details-sort"
                  className="text-[11.5px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  Sort by
                </label>
                <div className="relative">
                  <select
                    id="firm-details-sort"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className="h-8 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-[13px] text-slate-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {getSortOpts().map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="success" size="sm" dot>{t("easeGreen")}</Badge>
                <Badge variant="warn" size="sm" dot>{t("easeAmber")}</Badge>
                <Badge variant="danger" size="sm" dot>{t("easeRed")}</Badge>
              </div>
            </div>

            <HowItWorks open={showGuide} onToggle={() => setShowGuide(!showGuide)} />

            {computed.length === 0 ? (
              <EmptyState
                icon={Building2}
                title={t("noFirmsYet")}
                description={isAdmin ? t("clickAddFirm") : undefined}
              />
            ) : (
              <div className="space-y-3">
                {computed.map((firm, i) => (
                  <div key={firm.id} id={`firm-${firm.id}`}>
                    <FirmCard firm={firm} rank={i + 1} onEdit={isAdmin ? (f => setEditing(f)) : null} onDelete={isAdmin ? handleDelete : null} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "tracker" && session && (
          <AccountTracker accounts={accounts} onUpdate={setAccounts} firms={firms} />
        )}

        {tab === "dashboard" && session && (
          <FinancialDashboard accounts={accounts} firms={firms} />
        )}

        {tab === "login" && !session && (
          <AuthInline />
        )}

        {tab === "metrics" && (
          <MetricsGuide />
        )}

        {tab === "admin" && isAdmin && (
          <AdminPanel getAdminUsers={getAdminUsers} addAdminUser={addAdminUser} removeAdminUser={removeAdminUser} currentUserId={userId} />
        )}
      </div>

      {editing !== null && session && isAdmin && (
        <FirmForm
          initial={editing.id ? editing : null}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </AppShell>
  );
}