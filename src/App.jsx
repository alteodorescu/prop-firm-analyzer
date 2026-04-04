import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Info, Plus, Pencil, Trash2, X, Award, Sun, Moon, Globe, LogOut, Lock, Shield, UserPlus, UserMinus, Zap } from "lucide-react";
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
  if (v == null) return "bg-gray-100 text-gray-400";
  if (v >= .45) return "bg-emerald-100 text-emerald-700";
  if (v >= .25) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
};
const easeBorder = v => {
  if (v == null) return "border-gray-200";
  if (v >= .45) return "border-emerald-300";
  if (v >= .25) return "border-amber-300";
  return "border-red-300";
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
      <Info ref={iconRef} size={13} className="text-blue-400 cursor-help inline-block align-middle" onClick={() => { setShow(!show); updatePos(); }} onMouseEnter={() => { setShow(true); updatePos(); }} onMouseLeave={() => setShow(false)} />
      {show && createPortal(
        <div className="fixed z-[9999] w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl leading-relaxed whitespace-pre-line pointer-events-none" style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}>
          {text}
          <span className="absolute top-full left-1/2 border-4 border-transparent border-t-gray-900" style={{transform:"translateX(-50%)"}} />
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

  return (
    <div className="col-span-2">
      <label className="block text-xs font-medium text-gray-500 mb-1">{t("notes")}</label>
      <div className="flex gap-1 mb-1">
        <button type="button" onClick={() => wrap("**","**")} className="px-2 py-0.5 text-xs font-bold border border-gray-300 rounded hover:bg-gray-100" title="Bold (**text**)">B</button>
        <button type="button" onClick={() => wrap("*","*")} className="px-2 py-0.5 text-xs italic border border-gray-300 rounded hover:bg-gray-100" title="Italic (*text*)">I</button>
        <button type="button" onClick={() => wrap("==","==")} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-yellow-100" title="Highlight (==text==)" style={{background:"#fef9c3"}}>H</button>
        <button type="button" onClick={() => wrap("~~","~~")} className="px-2 py-0.5 text-xs line-through border border-gray-300 rounded hover:bg-gray-100" title="Strikethrough (~~text~~)">S</button>
        <span className="text-[10px] text-gray-400 self-center ml-2">{t("richTextHelp")}</span>
      </div>
      <textarea ref={ref} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-mono" rows={4} value={value || ""} onChange={e => onChange(e.target.value || null)} placeholder={t("specialRulesPlaceholder")} />
      {value && (
        <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichNotes(value) }} />
      )}
    </div>
  );
}

function Section({ title, open, onToggle, children, accent }) {
  const colors = { amber:"border-amber-200 bg-amber-50", orange:"border-orange-200 bg-orange-50", blue:"border-blue-200 bg-blue-50", emerald:"border-emerald-200 bg-emerald-50", gray:"border-gray-200 bg-gray-50" };
  const c = colors[accent] || colors.gray;
  return (
    <div className={`mt-3 rounded-lg border ${open ? c : "border-gray-200 bg-white"}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
        <span>{title}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Stat({ label, value, tip, sub }) {
  return (
    <div className="py-1">
      <div className="text-xs text-gray-400 flex items-center">{label}{tip && <Tip text={tip} />}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FIELD COMPONENT FOR FORMS
// ═══════════════════════════════════════════════════════════
function Field({ label, tip, value, onChange, prefix, suffix, placeholder, type, wide }) {
  if (type === "text") {
    return (
      <div className={wide ? "col-span-2" : ""}>
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}{tip && <Tip text={tip} />}</label>
        <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" value={value || ""} onChange={e => onChange(e.target.value || null)} placeholder={placeholder} />
      </div>
    );
  }
  if (type === "textarea") {
    return (
      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}{tip && <Tip text={tip} />}</label>
        <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" rows={3} value={value || ""} onChange={e => onChange(e.target.value || null)} placeholder={placeholder} />
      </div>
    );
  }
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}{tip && <Tip text={tip} />}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-gray-400 text-sm">{prefix}</span>}
        <input type="number" step="any" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" value={value == null ? "" : value} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder={placeholder || "—"} />
        {suffix && <span className="text-gray-400 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FIRM CARD
// ═══════════════════════════════════════════════════════════
function FirmCard({ firm, rank, onEdit, onDelete }) {
  const [sections, setSections] = useState({});
  const toggle = k => setSections(s => ({ ...s, [k]: !s[k] }));
  const f = firm;
  const rankColors = rank === 1 ? "bg-yellow-400 text-yellow-900" : rank === 2 ? "bg-gray-300 text-gray-700" : rank === 3 ? "bg-amber-300 text-amber-900" : "bg-gray-100 text-gray-500";

  return (
    <div className={`bg-white rounded-xl shadow-sm border-2 ${easeBorder(f.overallEase)} overflow-hidden transition-all`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${rankColors}`}>
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800 truncate">{f.name}</h3>
              <span className="text-sm font-semibold text-gray-500 ml-2 flex-shrink-0">{money(f.totalCost)} total</span>
            </div>
            <p className="text-xs text-gray-400">
              {f.model}
              {f.isInstant && <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-100 text-blue-700">INSTANT FUNDED</span>}
            </p>
          </div>
        </div>

        <div className={`grid ${f.isInstant ? "grid-cols-3" : "grid-cols-4"} gap-2 mt-3`}>
          <div className={`rounded-lg px-2 py-1.5 text-center ${easeClr(f.overallEase)}`}>
            <div className="text-lg font-bold leading-tight">{pct(f.overallEase)}</div>
            <div className="text-xs opacity-75 flex items-center justify-center gap-0.5">{f.isInstant ? "Ease" : "Overall"}<Tip text={TIPS.overallEase} /></div>
          </div>
          {!f.isInstant && <div className={`rounded-lg px-2 py-1.5 text-center ${easeClr(f.easeToPass)}`}>
            <div className="text-lg font-bold leading-tight">{pct(f.easeToPass)}</div>
            <div className="text-xs opacity-75 flex items-center justify-center gap-0.5">Pass<Tip text={TIPS.easeToPass} /></div>
          </div>}
          <div className={`rounded-lg px-2 py-1.5 text-center ${easeClr(f.easeToGetPaid)}`}>
            <div className="text-lg font-bold leading-tight">{pct(f.easeToGetPaid)}</div>
            <div className="text-xs opacity-75 flex items-center justify-center gap-0.5">Paid<Tip text={TIPS.easeToGetPaid} /></div>
          </div>
          <div className="rounded-lg px-2 py-1.5 text-center bg-indigo-50 text-indigo-700">
            <div className="text-lg font-bold leading-tight">{pct(f.maxRoi)}</div>
            <div className="text-xs opacity-75 flex items-center justify-center gap-0.5">ROI<Tip text={TIPS.roi} /></div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>Cost: {f.isInstant ? money(f.cost) : `${money(f.cost)} eval + ${money(f.activation)} activation`}</span>
          <span>{money(f.dailyProfitRate)}/day</span>
          <span>Net: {money(f.maxNetProfit)}</span>
          <span>{f.noResets ? "No resets" : f.resetsToBreakeven != null ? `${f.resetsToBreakeven}× resets` : ""}</span>
          <span>{f.isInstant ? `${f.daysToPayout} days` : `${f.totalDays} days total`}</span>
        </div>

        {!f.isInstant && <Section title={t("challengeRules")} open={sections.chal} onToggle={() => toggle("chal")} accent="amber">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <Stat label={t("profitTarget")} value={money(f.pt)} tip={TIPS.pt} />
            <Stat label={t("dailyLossLimit")} value={f.dll ? money(f.dll) : t("none")} tip={TIPS.dll} />
            <Stat label={t("maxLossLimit")} value={money(f.mll)} tip={TIPS.mll} sub={f.mllType && f.mllType !== "static" ? (f.mllType === "eod" ? t("trailingEod") : t("trailingIntraday")) : null} />
            <Stat label={t("consistency")} value={f.consistency ? pct(f.consistency) : t("none")} tip={TIPS.consistency} />
            <Stat label={t("minProfitDays")} value={f.minDays || t("none")} tip={TIPS.minDays} />
            <Stat label={t("daysToPass")} value={`${f.daysToPass} ${t("days")}`} tip={TIPS.daysCalc} sub={t("calculated")} />
          </div>
          <div className="mt-3 p-3 bg-amber-50 rounded-xl border-2 border-amber-300">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1">{t("bestPlan")} <Tip text={TIPS.dailyTarget} /></div>
              <div className="text-xs text-gray-400">{f.daysToPass} {t("days")}</div>
            </div>
            <div className="text-xl font-bold text-amber-700">{money(f.chalTarget)} <span className="text-sm font-medium text-amber-500">{t("perDay")}</span></div>
            <div className="text-xs text-gray-500 mb-2">{money(f.chalTarget)} × {f.daysToPass} {t("days")} = {money(f.pt)} {t("profitTarget").toLowerCase()}</div>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: f.daysToPass }, (_, i) => (
                <div key={i} className="rounded-md text-center py-1 px-2 bg-amber-200 border border-amber-300" style={{minWidth:"3.5rem"}}>
                  <div className="text-[10px] text-gray-400">D{i + 1}</div>
                  <div className="text-xs font-bold text-amber-800">{money(f.chalTarget)}</div>
                </div>
              ))}
            </div>
          </div>
          {f.chalScalingFactor < 1 && (() => {
            const tiers = migrateScalingTiers(f, "sc");
            return (
              <div className="mt-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-xs text-gray-500 flex items-center gap-1">{t("scalingFactor")} <Tip text={TIPS.scalingFactor} /></div>
                <div className="text-sm font-semibold text-yellow-700">{pct(f.chalScalingFactor)} <span className="text-xs font-normal text-gray-400">— {t("contractsLimited")}</span></div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {tiers.map((t, i) => {
                    const prev = i > 0 ? tiers[i - 1].upTo : 0;
                    const isLast = i === tiers.length - 1;
                    return <span key={i}>{i > 0 ? " → " : ""}${prev.toLocaleString()}–{isLast ? `$${(t.upTo || 0).toLocaleString()}+` : `$${(t.upTo || 0).toLocaleString()}`}: {t.contracts}</span>;
                  })}
                  {tiers.length > 0 && ` → above: ${f.maxNQ} max`}
                </div>
              </div>
            );
          })()}
        </Section>}

        <Section title={t("fundedRules")} open={sections.fund} onToggle={() => toggle("fund")} accent="orange">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <Stat label={t("activationFee")} value={money(f.activation)} tip={TIPS.activation} />
            <Stat label={t("dailyLossLimit")} value={f.fDll ? money(f.fDll) : t("none")} tip={TIPS.dll} />
            <Stat label={t("maxLossLimit")} value={money(f.fMll)} tip={TIPS.mll} sub={f.fMllType && f.fMllType !== "static" ? (f.fMllType === "eod" ? t("trailingEod") : t("trailingIntraday")) : null} />
            <Stat label={t("consistency")} value={f.fConsistency ? pct(f.fConsistency) : t("none")} tip={TIPS.consistency} />
            <Stat label={t("minProfitDays")} value={f.fMinDays || t("none")} tip={TIPS.minDays} />
            <Stat label={t("daysToPayout")} value={`${f.daysToPayout} ${t("days")}`} tip={TIPS.daysCalc} sub={t("calculated")} />
          </div>
          <div className="mt-3 p-3 bg-orange-50 rounded-xl border-2 border-orange-300">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide flex items-center gap-1">{t("bestPlan")} <Tip text={TIPS.dailyTarget} /></div>
              <div className="text-xs text-gray-400">{f.daysToPayout} {t("days")}</div>
            </div>
            <div className="text-xl font-bold text-orange-700">{money(f.fundTarget)} <span className="text-sm font-medium text-orange-500">{t("perDay")}</span></div>
            <div className="text-xs text-gray-500 mb-2">{money(f.fundTarget)} × {f.daysToPayout} {t("days")} = {money(f.reqBalMax)} {t("fundedTarget")}</div>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: f.daysToPayout }, (_, i) => (
                <div key={i} className="rounded-md text-center py-1 px-2 bg-orange-200 border border-orange-300" style={{minWidth:"3.5rem"}}>
                  <div className="text-[10px] text-gray-400">D{i + 1}</div>
                  <div className="text-xs font-bold text-orange-800">{money(f.fundTarget)}</div>
                </div>
              ))}
            </div>
          </div>
          {f.fundScalingFactor < 1 && (() => {
            const tiers = migrateScalingTiers(f, "sf");
            return (
              <div className="mt-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-xs text-gray-500 flex items-center gap-1">{t("scalingFactor")} <Tip text={TIPS.scalingFactor} /></div>
                <div className="text-sm font-semibold text-yellow-700">{pct(f.fundScalingFactor)} <span className="text-xs font-normal text-gray-400">— {t("contractsLimited")}</span></div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {tiers.map((t, i) => {
                    const prev = i > 0 ? tiers[i - 1].upTo : 0;
                    const isLast = i === tiers.length - 1;
                    return <span key={i}>{i > 0 ? " → " : ""}${prev.toLocaleString()}–{isLast ? `$${(t.upTo || 0).toLocaleString()}+` : `$${(t.upTo || 0).toLocaleString()}`}: {t.contracts}</span>;
                  })}
                  {tiers.length > 0 && ` → above: ${f.maxNQ} max`}
                </div>
              </div>
            );
          })()}
        </Section>

        <Section title={t("payoutRules")} open={sections.pay} onToggle={() => toggle("pay")} accent="blue">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <Stat label={t("buffer")} value={f.buffer ? money(f.buffer) : t("none")} tip={TIPS.buffer} />
            <Stat label={t("profitSplit")} value={pct(f.split)} tip={TIPS.split} />
            <Stat label={t("withdrawalPct")} value={pct(f.withdrawalPct != null ? f.withdrawalPct : 1)} tip={TIPS.withdrawalPct} />
            <Stat label={t("minNetPayout")} value={money(f.minNetPayout)} />
            <Stat label={t("maxNetPayout")} value={money(f.maxNetPayout)} />
            <Stat label={t("reqBalMin")} value={money(f.reqBalMin)} tip={TIPS.reqBalance} />
            <Stat label={t("reqBalMax")} value={money(f.reqBalMax)} tip={TIPS.reqBalance} />
          </div>
          {f.payoutTiers && f.payoutTiers.length > 0 && (
            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs font-semibold text-blue-700 mb-1">{t("payoutTiers")}</div>
              <div className="space-y-0.5">
                {f.payoutTiers.map((t, i) => (
                  <div key={i} className="text-xs text-gray-600">
                    <span className="font-medium text-blue-600">#{i + 1}</span>
                    {" "}min {money(t.min || 0)} — max {t.max != null ? money(t.max) : <span className="text-emerald-600 font-medium">unlimited</span>}
                    {t.max != null && f.split && <span className="text-gray-400 ml-1">(net: {money((t.max || 0) * f.split)})</span>}
                  </div>
                ))}
                {f.payoutTiers.length > 1 && (
                  <div className="text-[10px] text-gray-400 mt-0.5">#{f.payoutTiers.length + 1}+ uses #{f.payoutTiers.length} limits</div>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section title={t("financialsRoi")} open={sections.fin} onToggle={() => toggle("fin")} accent="emerald">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <Stat label={t("totalCost")} value={money(f.totalCost)} tip={TIPS.totalCost} />
            <Stat label={t("totalDays")} value={`${f.totalDays} ${t("days")}`} tip={TIPS.totalDays} />
            <Stat label="Max NQ" value={f.maxNQ || "—"} tip={TIPS.maxNQ} />
            <Stat label={t("minNetProfit")} value={<span className={f.minNetProfit < 0 ? "text-red-600" : ""}>{money(f.minNetProfit)}</span>} tip={TIPS.netProfit} sub={f.minNetProfit < 0 ? t("lossOnMinPayout") : f.minNetProfit === 0 ? t("breakeven") : null} />
            <Stat label={t("maxNetProfit")} value={<span className={f.maxNetProfit < 0 ? "text-red-600" : ""}>{money(f.maxNetProfit)}</span>} tip={TIPS.netProfit} sub={f.maxNetProfit < 0 ? t("lossEvenAtMax") : null} />
            <Stat label={t("maxRoi")} value={pct(f.maxRoi)} tip={TIPS.roi} />
          </div>
        </Section>

        {f.notes && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t("notes")}</div>
            <div className="text-sm text-gray-700 leading-relaxed rich-notes" dangerouslySetInnerHTML={{ __html: renderRichNotes(f.notes) }} />
          </div>
        )}

        {(onEdit || onDelete) && (
          <div className="flex justify-end gap-2 mt-3">
            {onEdit && <button onClick={() => onEdit(f)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
              <Pencil size={12} /> {t("edit")}
            </button>}
            {onDelete && <button onClick={() => onDelete(f.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
              <Trash2 size={12} /> {t("delete")}
            </button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAYOUT TIER EDITOR
// ═══════════════════════════════════════════════════════════
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
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 w-16 shrink-0">{t("payoutN")} #{i + 1}</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">{t("min")}</span>
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number" step="any"
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={tier.min == null ? "" : tier.min}
                onChange={e => updateTier(i, "min", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">{t("max")}</span>
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number" step="any"
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={tier.max == null ? "" : tier.max}
                onChange={e => updateTier(i, "max", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={isLast ? "no limit" : t("max")}
              />
              {isLast && tier.max == null && <span className="text-[10px] text-emerald-600 shrink-0">∞ {t("unlimited")}</span>}
            </div>
            <button onClick={() => removeTier(i)} className="p-0.5 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
          </div>
        );
      })}
      <button onClick={addTier} className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200">
        <Plus size={12} /> {t("addPayoutTier")}
      </button>
      {rows.length > 1 && (
        <div className="text-[10px] text-gray-400">
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
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
            <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
              <span className="text-gray-400 shrink-0">${prevUpTo.toLocaleString()}</span>
              <span className="text-gray-300 shrink-0">–</span>
              <span className="text-gray-400 shrink-0">$</span>
              <input
                type="number" step="any"
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={tier.upTo == null ? "" : tier.upTo}
                onChange={e => updateTier(i, "upTo", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={isLast ? "& above" : "up to"}
              />
            </div>
            <span className="text-xs text-gray-400 shrink-0">→</span>
            <div className="flex items-center gap-1">
              <input
                type="number" step="1" min="1"
                className="w-14 border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={tier.contracts == null ? "" : tier.contracts}
                onChange={e => updateTier(i, "contracts", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="#"
              />
              <span className="text-xs text-gray-400 shrink-0">contracts</span>
            </div>
            <button onClick={() => removeTier(i)} className="p-0.5 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
          </div>
        );
      })}
      <button onClick={addTier} className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200">
        <Plus size={12} /> {t("addTier")}
      </button>
      {rows.length > 0 && (
        <div className="text-[10px] text-gray-400">
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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-800">{initial ? t("editFirm") : t("addNewFirm")}</h2>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-1">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">{t("basicInfo")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("firmName")} value={form.name} onChange={v => set("name", v)} type="text" placeholder="e.g. Apex Trader Funding" />
              <Field label={t("modelPlan")} value={form.model} onChange={v => set("model", v)} type="text" placeholder="e.g. $50K EOD" />
              <Field label={t("evalCost")} value={form.cost} onChange={v => set("cost", v)} prefix="$" tip={TIPS.cost} placeholder="0" />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("resetCost")}<Tip text={TIPS.resetCost} /></label>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">$</span>
                  <input
                    type="number" step="any"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={form.resetCost === "na" ? "" : (form.resetCost == null ? "" : form.resetCost)}
                    onChange={e => set("resetCost", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="same as eval"
                    disabled={form.resetCost === "na"}
                  />
                  <button
                    type="button"
                    onClick={() => set("resetCost", form.resetCost === "na" ? null : "na")}
                    className={`shrink-0 px-2 py-2 text-xs font-semibold rounded-lg border transition-colors ${form.resetCost === "na" ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"}`}
                    title={form.resetCost === "na" ? "Resets not available — click to enable" : "Mark as no resets available"}
                  >N/A</button>
                </div>
              </div>
              <Field label={t("maxNqContracts")} value={form.maxNQ} onChange={v => set("maxNQ", v)} tip={TIPS.maxNQ} placeholder="—" />
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input type="checkbox" className="accent-blue-600 w-4 h-4" checked={!!form.instant} onChange={e => set("instant", e.target.checked)} />
              <span className="text-sm font-medium text-gray-700">{t("instantFunded")}</span>
              <span className="text-xs text-gray-400">{t("noChallenge")}</span>
            </label>
          </div>

          {!form.instant && <Section title={t("challengeRules")} open={sections.chal} onToggle={() => toggle("chal")} accent="amber">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("profitTargetReq")} value={form.pt} onChange={v => set("pt", v)} prefix="$" tip={TIPS.pt} />
              <Field label={t("maxLossLimitReq")} value={form.mll} onChange={v => set("mll", v)} prefix="$" tip={TIPS.mll} />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("mllDrawdownType")} <Tip text={TIPS.mllType} /></label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white" value={form.mllType || "static"} onChange={e => set("mllType", e.target.value)}>
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
          </Section>}

          <Section title={t("fundedRules")} open={sections.fund} onToggle={() => toggle("fund")} accent="orange">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("activationFee")} value={form.activation} onChange={v => set("activation", v)} prefix="$" tip={TIPS.activation} placeholder="0" />
              <Field label={t("maxLossLimit")} value={form.fMll} onChange={v => set("fMll", v)} prefix="$" tip={TIPS.mll} />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("mllDrawdownType")} <Tip text={TIPS.mllType} /></label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white" value={form.fMllType || "static"} onChange={e => set("fMllType", e.target.value)}>
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

          {!form.instant && <Section title={t("challengeScaling")} open={sections.scChal} onToggle={() => toggle("scChal")} accent="amber">
            <p className="text-xs text-gray-400 mb-2">{t("scalingDesc")} <Tip text={TIPS.scalingPlan} /></p>
            <ScalingTierEditor tiers={form.scalingChal || []} onChange={v => set("scalingChal", v)} maxContracts={form.maxNQ} />
          </Section>}

          <Section title={t("fundedScaling")} open={sections.scFund} onToggle={() => toggle("scFund")} accent="orange">
            <p className="text-xs text-gray-400 mb-2">{t("scalingFundDesc")} <Tip text={TIPS.scalingPlan} /></p>
            <ScalingTierEditor tiers={form.scalingFund || []} onChange={v => set("scalingFund", v)} maxContracts={form.maxNQ} />
          </Section>

          <Section title={t("payoutRules")} open={sections.pay} onToggle={() => toggle("pay")} accent="blue">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("buffer")} value={form.buffer} onChange={v => set("buffer", v)} prefix="$" tip={TIPS.buffer} placeholder="0" />
              <Field label={t("profitSplit")} value={form.split} onChange={v => set("split", v)} suffix="%" tip={TIPS.split} placeholder="e.g. 90" />
              <Field label={t("withdrawalPct")} value={form.withdrawalPct} onChange={v => set("withdrawalPct", v)} suffix="%" tip={TIPS.withdrawalPct} placeholder="100 (default)" />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("payoutTiers")} <Tip text={TIPS.payoutTiers} /></label>
              <PayoutTierEditor tiers={form.payoutTiers || []} onChange={v => set("payoutTiers", v)} />
            </div>
          </Section>

          <Section title={t("notes")} open={sections.notes} onToggle={() => toggle("notes")} accent="gray">
            <RichTextEditor value={form.notes} onChange={v => set("notes", v)} />
          </Section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-4 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">{t("cancel")}</button>
          <button onClick={handleSave} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">{initial ? t("updateFirm") : t("addFirm")}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// METRICS GUIDE PAGE — full documentation of every metric
// ═══════════════════════════════════════════════════════════
function MetricBlock({ titleKey, formulaKey, inputsKey, descKey, exampleKey }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <h3 className="text-base font-bold text-indigo-800">{t(titleKey)}</h3>

      {formulaKey && (
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">{t("mgFormula")}</span>
          <pre className="mt-1 bg-gray-100 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed overflow-x-auto">{t(formulaKey)}</pre>
        </div>
      )}

      {inputsKey && (
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">{t("mgInputs")}</span>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-line leading-relaxed">{t(inputsKey)}</p>
        </div>
      )}

      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">{t("mgDescription")}</span>
        <p className="mt-1 text-sm text-gray-700 leading-relaxed">{t(descKey)}</p>
      </div>

      {exampleKey && (
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600">{t("mgExample")}</span>
          <pre className="mt-1 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed overflow-x-auto">{t(exampleKey)}</pre>
        </div>
      )}
    </div>
  );
}

function MetricsGuide() {
  return (
    <div className="space-y-8">
      {/* Title & intro */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{t("mgTitle")}</h1>
        <p className="text-sm text-gray-500 max-w-2xl mx-auto">{t("mgIntro")}</p>
      </div>

      {/* ── Section 1: Comparison & Ranking ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 border-b-2 border-indigo-300 pb-1 mb-4 flex items-center gap-2">
          <span className="text-indigo-500">📊</span> {t("mgSectionComparison")}
        </h2>
        <div className="space-y-4">
          <MetricBlock titleKey="mgEffMllTitle" formulaKey="mgEffMllFormula" inputsKey="mgEffMllInputs" descKey="mgEffMllDesc" exampleKey="mgEffMllExample" />
          <MetricBlock titleKey="mgRoomScoreTitle" formulaKey="mgRoomScoreFormula" inputsKey="mgRoomScoreInputs" descKey="mgRoomScoreDesc" exampleKey="mgRoomScoreExample" />
          <MetricBlock titleKey="mgDaysFactorTitle" formulaKey="mgDaysFactorFormula" inputsKey="mgDaysFactorInputs" descKey="mgDaysFactorDesc" exampleKey="mgDaysFactorExample" />
          <MetricBlock titleKey="mgScalingFactorTitle" formulaKey="mgScalingFactorFormula" inputsKey="mgScalingFactorInputs" descKey="mgScalingFactorDesc" exampleKey="mgScalingFactorExample" />
          <MetricBlock titleKey="mgEaseToPassTitle" formulaKey="mgEaseToPassFormula" inputsKey="mgEaseToPassInputs" descKey="mgEaseToPassDesc" exampleKey="mgEaseToPassExample" />
          <MetricBlock titleKey="mgEaseToGetPaidTitle" formulaKey="mgEaseToGetPaidFormula" inputsKey="mgEaseToGetPaidInputs" descKey="mgEaseToGetPaidDesc" exampleKey="mgEaseToGetPaidExample" />
          <MetricBlock titleKey="mgOverallEaseTitle" formulaKey="mgOverallEaseFormula" inputsKey="mgOverallEaseInputs" descKey="mgOverallEaseDesc" exampleKey="mgOverallEaseExample" />
          <MetricBlock titleKey="mgDaysTitle" formulaKey="mgDaysFormula" inputsKey="mgDaysInputs" descKey="mgDaysDesc" exampleKey="mgDaysExample" />
        </div>
      </div>

      {/* ── Section 2: Financial Metrics ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 border-b-2 border-emerald-300 pb-1 mb-4 flex items-center gap-2">
          <span className="text-emerald-500">💰</span> {t("mgSectionFinancial")}
        </h2>
        <div className="space-y-4">
          <MetricBlock titleKey="mgTotalCostTitle" formulaKey="mgTotalCostFormula" descKey="mgTotalCostDesc" />
          <MetricBlock titleKey="mgNetProfitTitle" formulaKey="mgNetProfitFormula" descKey="mgNetProfitDesc" exampleKey="mgNetProfitExample" />
          <MetricBlock titleKey="mgRoiTitle" formulaKey="mgRoiFormula" descKey="mgRoiDesc" exampleKey="mgRoiExample" />
          <MetricBlock titleKey="mgDailyRateTitle" formulaKey="mgDailyRateFormula" descKey="mgDailyRateDesc" exampleKey="mgDailyRateExample" />
          <MetricBlock titleKey="mgResetsTitle" formulaKey="mgResetsFormula" inputsKey="mgResetsInputs" descKey="mgResetsDesc" exampleKey="mgResetsExample" />
          <MetricBlock titleKey="mgReqBalTitle" formulaKey="mgReqBalFormula" descKey="mgReqBalDesc" />
        </div>
      </div>

      {/* ── Section 3: Live Account Metrics ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 border-b-2 border-blue-300 pb-1 mb-4 flex items-center gap-2">
          <span className="text-blue-500">📈</span> {t("mgSectionLive")}
        </h2>
        <div className="space-y-4">
          <MetricBlock titleKey="mgConsistencyTitle" formulaKey="mgConsistencyFormula" inputsKey="mgConsistencyInputs" descKey="mgConsistencyDesc" exampleKey="mgConsistencyExample" />
          <MetricBlock titleKey="mgMaxSafeTitle" formulaKey="mgMaxSafeFormula" inputsKey="mgMaxSafeInputs" descKey="mgMaxSafeDesc" exampleKey="mgMaxSafeExample" />
          <MetricBlock titleKey="mgDrawdownTitle" formulaKey="mgDrawdownFormula" descKey="mgDrawdownDesc" exampleKey="mgDrawdownExample" />
          <MetricBlock titleKey="mgAllRulesTitle" formulaKey="mgAllRulesFormula" descKey="mgAllRulesDesc" />
          <MetricBlock titleKey="mgLiveEaseTitle" formulaKey="mgLiveEaseFormula" descKey="mgLiveEaseDesc" />
          <MetricBlock titleKey="mgLiveScalingTitle" formulaKey="mgLiveScalingFormula" descKey="mgLiveScalingDesc" />
        </div>
      </div>

      {/* ── Section 4: Today's Trading Plan ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 border-b-2 border-amber-300 pb-1 mb-4 flex items-center gap-2">
          <span className="text-amber-500">🎯</span> {t("mgSectionTrading")}
        </h2>
        <div className="space-y-4">
          <MetricBlock titleKey="mgIdealTargetTitle" formulaKey="mgIdealTargetFormula" inputsKey="mgIdealTargetInputs" descKey="mgIdealTargetDesc" exampleKey="mgIdealTargetExample" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOW IT WORKS PANEL
// ═══════════════════════════════════════════════════════════
function HowItWorks({ open, onToggle }) {
  if (!open) return (
    <button onClick={onToggle} className="w-full text-left p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-2">
      <Info size={16} /> <span className="font-medium">{t("howCalculated")}</span> <ChevronRight size={14} className="ml-auto" />
    </button>
  );

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
      <button onClick={onToggle} className="w-full text-left flex items-center justify-between mb-3">
        <span className="font-semibold text-indigo-800 flex items-center gap-2"><Info size={16} /> {t("howCalculated")}</span>
        <ChevronDown size={16} className="text-indigo-600" />
      </button>
      <div className="space-y-4 text-sm text-gray-700">
        <div>
          <h4 className="font-semibold text-indigo-700 mb-1">{t("easeToPassTitle")}</h4>
          <p className="text-xs leading-relaxed mb-1"><strong>Room Score</strong>: If DLL exists: (DLL/PT) × (1 + log₂(MLL/DLL) × 0.25). If no DLL: MLL/PT. Higher DLL or no DLL = more room per session.</p>
          <p className="text-xs leading-relaxed"><strong>Days Factor</strong>: (1/eff_days)^0.3. Where eff_days = MAX(Min days, ⌈1/Consistency⌉). Fewer days = less penalty.</p>
          <p className="text-xs leading-relaxed"><strong>Scaling Factor</strong>: weighted avg contracts ÷ max contracts. 100% if no scaling plan. Final: Room × Days Factor × Scaling Factor.</p>
        </div>
        <div>
          <h4 className="font-semibold text-indigo-700 mb-1">{t("easeToGetPaidTitle")}</h4>
          <p className="text-xs leading-relaxed">Same formula, but uses funded DLL/MLL/Consistency/Days. Target = MAX(Buffer + Max Payout, Max Payout ÷ Withdrawal %). Handles two payout models:</p>
          <p className="text-xs leading-relaxed mt-1"><strong>Buffer model</strong> (Withdrawal %=100%): target = Buffer + Max Payout. <strong>Profit-split model</strong> (e.g. 50%): target = MaxPay ÷ 0.5 = 2× MaxPay. The MAX picks whichever is stricter.</p>
        </div>
        <div>
          <h4 className="font-semibold text-indigo-700 mb-1">{t("overallEaseTitle")}</h4>
          <p className="text-xs leading-relaxed">Geometric mean: √(Pass × Paid). Unlike a regular average, this penalizes imbalance. A firm easy to pass but hard to get paid (or vice versa) scores lower than a balanced one.</p>
        </div>
        <div>
          <h4 className="font-semibold text-indigo-700 mb-1">{t("daysFormula")}</h4>
          <p className="text-xs leading-relaxed">MAX(Min profitable days, ⌈1/Consistency⌉). Takes the stricter of explicit minimum days or consistency-implied minimum. E.g. 40% consistency → need ⌈1/0.4⌉ = 3 days minimum.</p>
        </div>
        <div>
          <h4 className="font-semibold text-indigo-700 mb-1">{t("tunableParams")}</h4>
          <p className="text-xs leading-relaxed"><strong>0.25</strong> — MLL runway bonus weight. Higher = MLL matters more when DLL exists.</p>
          <p className="text-xs leading-relaxed"><strong>0.3</strong> — Days exponent. Higher = more days penalty. At 0.3, 10 days halves the score vs 1 day.</p>
        </div>
      </div>
    </div>
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

const medalIcon = rank => {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return rank;
};

const rowBg = (rank, ease) => {
  if (ease == null) return "bg-gray-50";
  if (rank <= 3 && ease >= .45) return "bg-emerald-50";
  if (ease >= .45) return "bg-emerald-50/50";
  if (ease >= .25) return "bg-amber-50/50";
  return "bg-red-50/50";
};

function ComparisonTable({ firms, sortKey, onSort, onFirmClick }) {
  const cols = getTableCols();
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-700 text-white">
            <th className="px-2 py-2.5 text-center w-10 text-xs font-bold">#</th>
            <th className="px-3 py-2.5 text-left text-xs font-bold min-w-[140px]">Firm</th>
            {cols.map(col => (
              <th
                key={col.key}
                className={`px-2 py-2.5 text-center text-xs font-bold whitespace-pre-line leading-tight ${col.sort ? "cursor-pointer hover:bg-slate-600 transition-colors select-none" : ""} ${sortKey === col.key ? "bg-slate-500" : ""}`}
                onClick={() => col.sort && onSort(col.key)}
              >
                {col.label}{col.sort && (sortKey === col.key ? " ▼" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {firms.map((f, i) => {
            const rank = i + 1;
            return (
              <tr key={f.id} className={`${rowBg(rank, f.overallEase)} border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${rank <= 3 ? "font-medium" : ""}`}>
                <td className="px-2 py-2 text-center text-base">{medalIcon(rank)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => onFirmClick(f.id)} className="text-left hover:underline text-blue-700 font-semibold text-sm leading-tight">
                    {f.name}
                  </button>
                  <div className="text-xs text-gray-400 leading-tight">
                    {f.model}
                    {f.isInstant && <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-100 text-blue-700">INSTANT</span>}
                  </div>
                </td>
                {cols.map(col => {
                  const val = f[col.key];
                  const isEase = col.key.includes("ase") || col.key.includes("Ease");
                  let cellClr = "text-gray-700";
                  if (isEase && val != null) {
                    cellClr = val >= .45 ? "text-emerald-700 font-bold" : val >= .25 ? "text-amber-600 font-semibold" : "text-red-600 font-semibold";
                  }
                  if (col.key === "maxRoi" && val != null) {
                    cellClr = val >= 5 ? "text-emerald-700 font-bold" : val >= 2 ? "text-amber-600 font-semibold" : "text-gray-700";
                  }
                  if (col.key === "maxNetProfit" && val != null) {
                    cellClr = val < 0 ? "text-red-600" : "text-gray-700";
                  }
                  return (
                    <td key={col.key} className={`px-2 py-2 text-center text-sm ${cellClr} ${col.primary ? "text-base" : ""}`}>
                      {col.fmt(val, f)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {firms.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No firms yet</p>
          <p className="text-sm mt-1">Click "Add Firm" to get started</p>
        </div>
      )}
    </div>
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

// Journal Entry Form
function JournalEntryForm({ onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || { date: new Date().toISOString().slice(0, 10), balance: "", pnl: "", trades: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.date} onChange={e => set("date", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">EOD Balance</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" step="any" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.balance} onChange={e => set("balance", e.target.value === "" ? "" : Number(e.target.value))} placeholder="50000" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Day P&L</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" step="any" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.pnl} onChange={e => set("pnl", e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1"># Trades</label>
          <input type="number" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.trades} onChange={e => set("trades", e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
        <input type="text" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="What happened today..." />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={() => { if (!form.balance && form.balance !== 0) { alert("Balance is required"); return; } onSave({ ...form, id: initial?.id || Date.now() }); }} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded">{initial ? "Update" : "Add Entry"}</button>
      </div>
    </div>
  );
}

// Metric badge
function MetricBadge({ label, value, sub, color }) {
  const clr = color === "green" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : color === "red" ? "bg-red-50 border-red-200 text-red-700"
    : color === "amber" ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-gray-50 border-gray-200 text-gray-700";
  return (
    <div className={`rounded-lg border p-2 text-center ${clr}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-[10px] opacity-60">{sub}</div>}
    </div>
  );
}

// Progress bar
function ProgressBar({ pct, label, color }) {
  const bg = color === "green" ? "bg-emerald-500" : color === "red" ? "bg-red-500" : color === "amber" ? "bg-amber-500" : "bg-blue-500";
  return (
    <div>
      {label && <div className="text-xs text-gray-500 mb-0.5">{label}</div>}
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bg}`} style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }} />
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

  return (
    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-emerald-800">Record Payout #{payoutNumber || 1}</div>
        {payoutTiers.length > 0 && (
          <div className="text-[10px] text-gray-500">
            Tier limits: min {money(tierMin)}{tierMax != null ? ` — max ${money(tierMax)}` : " — no max limit"}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date</label>
          <input type="date" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Payout Amount (gross)</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" step="any" className={`w-full border rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${belowMin || aboveMax ? "border-red-400 bg-red-50" : "border-gray-300"}`} value={amount} onChange={e => setAmount(e.target.value)} placeholder={tierMax != null ? `${tierMin}–${tierMax}` : `min ${tierMin}`} />
          </div>
          {grossAmount > 0 && split < 1 && (
            <div className="text-[10px] text-emerald-600 mt-0.5">Net after {(split * 100).toFixed(0)}% split: {money(netAmount)}</div>
          )}
          {belowMin && <div className="text-[10px] text-red-600 mt-0.5">Below minimum payout ({money(tierMin)})</div>}
          {aboveMax && <div className="text-[10px] text-red-600 mt-0.5">Exceeds maximum payout ({money(tierMax)})</div>}
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">New Starting Balance</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" step="any" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={newBalance} onChange={e => setNewBalance(Number(e.target.value))} />
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">Balance after payout withdrawal</div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes (optional)</label>
          <input type="text" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Payout #1" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={() => {
          if (!grossAmount || grossAmount <= 0) { alert("Enter a payout amount"); return; }
          onSave({ date, amount: grossAmount, netAmount, newBalance, notes });
        }} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm">
          Record Payout
        </button>
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

  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
      <div className="text-xs font-bold text-amber-800">Reset Account</div>
      <div className="text-[10px] text-amber-600 -mt-1">This clears the journal and restarts metrics. The cost is recorded as an expense.</div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date</label>
          <input type="date" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Reset Cost</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" step="any" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={cost} onChange={e => setCost(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">New Starting Balance</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" step="any" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={newBalance} onChange={e => setNewBalance(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes (optional)</label>
          <input type="text" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Breached on NQ" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={() => {
          if (!confirm("Reset this account? Journal entries will be cleared and a new cycle begins.")) return;
          onSave({ date, cost, newBalance, notes });
        }} className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-sm">
          Confirm Reset
        </button>
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

  const statusColor = !f ? "gray" : m.allRulesMet ? "green" : m.ddPct <= 0 ? "red" : m.ddPct < 0.25 ? "red" : m.ddPct < 0.5 ? "amber" : "blue";
  const statusLabel = !f ? t("statusNoFirm") : m.allRulesMet ? (m.phase === "challenge" ? t("statusTargetHit") : t("statusPayoutReady")) : m.ddPct <= 0 ? t("statusBreached") : t("statusActive");

  return (
    <div className={`bg-white rounded-xl border ${selected ? "border-blue-400 ring-1 ring-blue-200" : statusColor === "red" ? "border-red-300" : statusColor === "green" ? "border-emerald-300" : "border-gray-200"} shadow-sm overflow-hidden`}>
      {/* Header — always visible */}
      <div className={`px-4 py-3 ${collapsed ? "" : "border-b border-gray-100"} flex items-center justify-between cursor-pointer select-none hover:bg-gray-50/50`} onClick={onToggleCollapse}>
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSelect && <input type="checkbox" className="accent-blue-600 w-3.5 h-3.5 shrink-0 cursor-pointer" checked={!!selected} onChange={onToggleSelect} onClick={e => e.stopPropagation()} />}
          <span className="text-gray-400 shrink-0">{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${firmData?.instant ? "bg-blue-100 text-blue-700" : account.phase === "challenge" ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"}`}>
            {firmData?.instant ? t("labelInstant") : account.phase === "challenge" ? t("labelChallenge") : t("labelFunded")}
          </span>
          <h3 className="font-bold text-gray-800 truncate">{account.label || `${firmData?.name || "?"} ${firmData?.model || ""}`}</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColor === "green" ? "bg-emerald-100 text-emerald-700" : statusColor === "red" ? "bg-red-100 text-red-700" : statusColor === "amber" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
            {statusLabel}
          </span>
          {/* Compact stats when collapsed */}
          {collapsed && f && (
            <div className="flex items-center gap-3 text-xs text-gray-500 ml-2 shrink-0">
              <span>P&L: <b className={m.totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}>{money(m.totalPnl)}</b></span>
              <span>DD: <b className={m.ddPct >= 0.5 ? "text-emerald-600" : m.ddPct >= 0.25 ? "text-amber-600" : "text-red-600"}>{(m.ddPct * 100).toFixed(0)}%</b></span>
              <span>{(m.pctComplete * 100).toFixed(0)}% complete</span>
              {m.todayPlan && !m.todayPlan.isBreached && !m.todayPlan.isTargetHit && m.todayPlan.contractsAllowed && (
                <span className="text-slate-600 border-l border-gray-300 pl-3">
                  <b>{m.todayPlan.contractsAllowed}</b> NQ → aim <b className="text-emerald-600">{money(m.todayPlan.idealDailyTarget)}</b> / max loss <b className="text-red-600">{money(m.todayPlan.maxDailyLoss)}</b>
                </span>
              )}
              {m.totalPayouts > 0 && <span>Paid: <b className="text-emerald-600">{money(m.totalPayouts)}</b></span>}
              {account.autoEnabled && <span className="flex items-center gap-0.5 text-emerald-600 border-l border-gray-300 pl-3"><Zap size={10} className="fill-emerald-500" /> Auto</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => {
              const newVal = !account.autoEnabled;
              onUpdate({ ...account, autoEnabled: newVal });
              if (newVal && !collapsed) setShowAutoSettings(true);
            }}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${account.autoEnabled ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}
            title={account.autoEnabled ? t("autoEnabled") : t("autoDisabled")}
          >
            <Zap size={12} className={account.autoEnabled ? "fill-emerald-500" : ""} />
            {t("autoToggle")}
          </button>
          {!firmData?.instant && <button onClick={togglePhase} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded" title="Switch phase">↔ Phase</button>}
          <button onClick={() => onDelete(account.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="text-xs text-gray-400 px-4 pb-2 -mt-1">
        {t("started")} {account.startDate || "—"} • {entries.length} {t("journalEntries")}
        {payouts.length > 0 && <> • <span className="text-emerald-600 font-medium">{payouts.length} {t("payoutN")}{payouts.length !== 1 ? "s" : ""} ({money(m.totalPayouts)})</span></>}
        {resets.length > 0 && <> • <span className="text-amber-600 font-medium">{resets.length} {t("resetN")}{resets.length !== 1 ? "s" : ""} ({money(m.totalResetCost)})</span></>}
      </div>

      {/* Automation Settings Panel */}
      {!collapsed && account.autoEnabled && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-3 bg-emerald-50/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-emerald-600 fill-emerald-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">{t("autoSettings")}</span>
              </div>
              <span className="text-xs text-emerald-600 font-medium">{t("autoStatusActive")}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("autoSession")}</label>
                <select
                  value={account.autoSessions || "both"}
                  onChange={(e) => onUpdate({ ...account, autoSessions: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
                >
                  <option value="london">{t("autoSessionLondon")}</option>
                  <option value="ny">{t("autoSessionNy")}</option>
                  <option value="both">{t("autoSessionBoth")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("autoTradovateId")}</label>
                <input
                  type="text"
                  value={account.tradovateAccountId || ""}
                  onChange={(e) => onUpdate({ ...account, tradovateAccountId: e.target.value })}
                  placeholder={t("autoTradovateIdPlaceholder")}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("autoTradovateUsername")}</label>
                <input
                  type="text"
                  value={account.tradovateUsername || ""}
                  onChange={(e) => onUpdate({ ...account, tradovateUsername: e.target.value })}
                  placeholder={t("autoTradovateUsernamePlaceholder")}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("autoTradovatePassword")}</label>
                <input
                  type="password"
                  value={account.tradovatePassword || ""}
                  onChange={(e) => onUpdate({ ...account, tradovatePassword: e.target.value })}
                  placeholder={t("autoTradovatePasswordPlaceholder")}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">{t("autoTradovateCredNote")}</p>
          </div>
        </div>
      )}

      {/* Metrics Dashboard — collapsible */}
      {!collapsed && <div className="border-t border-gray-100" />}
      {!collapsed && f && (
        <div className="px-4 py-3 space-y-3">
          {/* Top row — key numbers */}
          <div className="grid grid-cols-5 gap-2">
            <MetricBadge label={t("balance")} value={money(m.currentBal)} sub={m.payoutCount > 0 ? `${t("cycleStart")} ${money(m.effectiveStartBal)}` : `${t("start")} ${money(account.startBalance || 50000)}`} />
            <MetricBadge label={t("totalPnl")} value={money(m.totalPnl)} color={m.totalPnl > 0 ? "green" : m.totalPnl < 0 ? "red" : "gray"} sub={`${t("target")}: ${money(m.target)}`} />
            <MetricBadge label={t("remaining")} value={money(m.remainingProfit)} color={m.remainingProfit <= 0 ? "green" : "amber"} sub={`${(m.pctComplete * 100).toFixed(0)}% ${t("complete").toLowerCase()}`} />
            <MetricBadge label={t("roomToDD")} value={money(m.roomToDD)} color={m.ddPct >= 0.5 ? "green" : m.ddPct >= 0.25 ? "amber" : "red"} sub={`${t("floor")}: ${money(m.ddFloor)}`} />
            <MetricBadge label={t("liveEase")} value={m.liveEase != null ? pct(m.liveEase) : m.allRulesMet ? "Done" : "—"} color={m.liveEase != null ? (m.liveEase >= 0.45 ? "green" : m.liveEase >= 0.25 ? "amber" : "red") : "gray"} sub={t("recalculated")} />
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-2 gap-3">
            <ProgressBar pct={m.pctComplete} label={`${t("profitOfTarget", (m.pctComplete * 100).toFixed(0))} ${m.target > m.baseTarget ? "adjusted " : ""}${t("target")}`} color={m.pctComplete >= 1 ? "green" : "blue"} />
            <ProgressBar pct={m.ddPct} label={`${t("safetyDDRoom", (m.ddPct * 100).toFixed(0))}`} color={m.ddPct >= 0.5 ? "green" : m.ddPct >= 0.25 ? "amber" : "red"} />
          </div>

          {/* ── Today's Trading Plan ── */}
          {m.todayPlan && !m.todayPlan.isBreached && (
            <div className={`rounded-lg border-2 p-3 space-y-2 ${m.todayPlan.isTargetHit ? "bg-emerald-50 border-emerald-300" : "bg-slate-50 border-slate-300"}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {m.todayPlan.isTargetHit
                    ? (m.phase === "funded" ? `🎯 ${t("payoutReady")}` : `🎯 ${t("targetReached")}`)
                    : `📋 ${t("todaysTradingPlan")}`}
                </div>
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.totalPnl >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {m.totalPnl >= 0 ? "+" : ""}{money(m.totalPnl)} P&L
                </div>
              </div>

              {m.todayPlan.isTargetHit ? (
                /* Target hit / payout ready state */
                <div className="space-y-1.5">
                  {m.phase === "funded" ? (
                    <div className="text-sm text-emerald-800">
                      <b>{t("requestPayout", m.todayPlan.nextPayoutNum)}</b>
                      {m.todayPlan.payoutMax != null
                        ? <> — {t("min")} {money(m.todayPlan.payoutMin)}, {t("max")} {money(m.todayPlan.payoutMax)}</>
                        : <> — {t("min")} {money(m.todayPlan.payoutMin)}, <span className="font-semibold">{t("unlimited")}</span></>
                      }
                    </div>
                  ) : (
                    <div className="text-sm text-emerald-800">
                      <b>{t("advanceToFunded")}</b> {t("profitTarget").toLowerCase()} {t("of")} {money(m.target)} {t("met").toLowerCase()}.
                    </div>
                  )}
                  {m.todayPlan.contractsAllowed && (
                    <div className="text-xs text-gray-500">
                      {t("allowed")}: <b className="text-slate-700">{m.todayPlan.contractsAllowed}</b> / {m.todayPlan.maxContracts || "?"} {t("contracts").toLowerCase()}
                      {m.todayPlan.maxDailyProfit != null && <> • Max safe day profit: <b className="text-amber-700">{money(m.todayPlan.maxDailyProfit)}</b></>}
                      {m.todayPlan.maxDailyLoss > 0 && <> • Max loss: <b className="text-red-600">{money(m.todayPlan.maxDailyLoss)}</b></>}
                    </div>
                  )}
                </div>
              ) : (
                /* Active trading state */
                <div className="space-y-2">
                  {/* Main instruction row */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Contracts */}
                    <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                      <div className="text-[10px] text-gray-400 uppercase">{t("contracts")}</div>
                      <div className="text-lg font-bold text-slate-800">{m.todayPlan.contractsAllowed || "?"}</div>
                      <div className="text-[10px] text-gray-400">{t("ofMax", m.todayPlan.maxContracts || "?")}</div>
                      {m.todayPlan.nextScalingThreshold != null && m.todayPlan.contractsAllowed < (m.todayPlan.maxContracts || Infinity) && (
                        <div className="text-[10px] text-blue-500 mt-0.5">
                          +1 at {money(m.todayPlan.nextScalingThreshold)} profit
                        </div>
                      )}
                    </div>
                    {/* Target */}
                    <div className="bg-white rounded-lg border border-emerald-200 p-2 text-center">
                      <div className="text-[10px] text-gray-400 uppercase">{t("aimFor")}</div>
                      <div className="text-lg font-bold text-emerald-700">{money(m.todayPlan.idealDailyTarget)}</div>
                      <div className="text-[10px] text-gray-400">{t("leftOver", money(m.remainingProfit), m.todayPlan.minDaysToComplete)}</div>
                      {m.todayPlan.minProfitPerDay > 0 && (
                        <div className="text-[10px] text-amber-600 mt-0.5">{t("minToCount", money(m.todayPlan.minProfitPerDay))}</div>
                      )}
                    </div>
                    {/* Risk */}
                    <div className="bg-white rounded-lg border border-red-200 p-2 text-center">
                      <div className="text-[10px] text-gray-400 uppercase">{t("maxLoss")}</div>
                      <div className="text-lg font-bold text-red-600">{money(m.todayPlan.maxDailyLoss)}</div>
                      <div className="text-[10px] text-gray-400">{m.dll ? `${t("dll")}: ${money(m.dll)}` : t("noDll")}</div>
                    </div>
                  </div>

                  {/* Guardrails row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {m.todayPlan.maxDailyProfit != null && (
                      <span>
                        {m.todayPlan.maxDailyProfitReason === "consistency"
                          ? <>{t("doNotProfit")} <b className="text-amber-700">{money(m.todayPlan.maxDailyProfit)}</b> ({t("consistency").toLowerCase()})</>
                          : <>Remaining to {t("target")}: <b className="text-slate-700">{money(m.todayPlan.maxDailyProfit)}</b></>
                        }
                      </span>
                    )}
                    <span>{t("ddRoom")}: <b className={m.ddPct >= 0.5 ? "text-emerald-600" : m.ddPct >= 0.25 ? "text-amber-600" : "text-red-600"}>{money(m.roomToDD)}</b> ({(m.ddPct * 100).toFixed(0)}%)</span>
                    {m.todayPlan.daysNeeded > 0 && (
                      <span>{t("profitDaysNeeded")}: <b className="text-slate-700">{m.todayPlan.daysNeeded}</b></span>
                    )}
                    {m.phase === "funded" && m.todayPlan.payoutMax != null && (
                      <span>{t("payoutMax", m.todayPlan.nextPayoutNum)}: <b className="text-blue-600">{money(m.todayPlan.payoutMax)}</b></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Breached state */}
          {m.todayPlan && m.todayPlan.isBreached && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-red-700 mb-1">⛔ Account Breached</div>
              <div className="text-sm text-red-800">
                This account has breached its drawdown limit. <b>Do not trade.</b>
                {!f?.noResets && <> Use the Reset button below to restart with a fresh journal.</>}
              </div>
            </div>
          )}

          {/* Secondary stats */}
          <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
            <span>Win rate: <b className="text-gray-700">{(m.winRate * 100).toFixed(0)}%</b> ({m.wins}W / {m.losses}L)</span>
            <span>Peak: <b className="text-gray-700">{money(m.peakBal)}</b></span>
            <span>MLL: {money(m.mll)} ({m.mllType})</span>
            {m.resetCount > 0 && <span>Resets: <b className="text-amber-600">{m.resetCount}</b> (cost: {money(m.totalResetCost)})</span>}
            {m.resetCount > 0 && m.resetsToBreakeven != null && (
              <span>Resets to breakeven: <b className={m.resetsToBreakeven > 0 ? "text-amber-600" : "text-red-600"}>{m.resetsToBreakeven > 0 ? m.resetsToBreakeven : "exceeded"}</b></span>
            )}
          </div>

          {/* ── Rules Compliance Panel ── */}
          {m.rules && m.rules.length > 0 && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-2.5 space-y-1.5">
              <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">Rules Compliance</div>
              {m.rules.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${r.status === "ok" ? "bg-emerald-100 text-emerald-700" : r.status === "caution" ? "bg-amber-100 text-amber-700" : r.status === "warning" ? "bg-red-100 text-red-600" : "bg-red-600 text-white"}`}>
                    {r.status === "ok" ? "✓" : r.status === "caution" ? "!" : "✗"}
                  </span>
                  <span className="text-gray-700">
                    <b className="text-gray-800">{r.label}:</b> {r.detail}
                  </span>
                </div>
              ))}
              {/* Show adjusted target callout if consistency pushed it up */}
              {m.consistencyAdjTarget > m.baseTarget && m.phase === "challenge" && (
                <div className="mt-1 pt-1.5 border-t border-gray-200 text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
                  <b>Target adjusted:</b> {money(m.baseTarget)} → {money(m.consistencyAdjTarget)} (+{money(m.consistencyAdjTarget - m.baseTarget)}).
                  {m.consistencyGap > 0 && <> Need <b>{money(m.consistencyGap)}</b> more profit to become compliant, or spread profits across more days.</>}
                </div>
              )}
              {m.consistencyAdjTarget > m.baseTarget && m.phase === "funded" && m.consistencyGap > 0 && (
                <div className="mt-1 pt-1.5 border-t border-gray-200 text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
                  <b>Payout eligibility at risk:</b> Need <b>{money(m.consistencyGap)}</b> more profit spread across other days before requesting max payout.
                </div>
              )}
              {m.consistencyAdjTarget > m.baseTarget && m.phase === "funded" && m.consistencyGap <= 0 && m.allRulesMet && (
                <div className="mt-1 pt-1.5 border-t border-gray-200 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5">
                  <b>Congratulations!</b> It is recommended to request your reward! You might not get a second chance!
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payouts — funded accounts only */}
      {!collapsed && account.phase === "funded" && f && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 flex items-center justify-between">
            <button onClick={() => setShowPayouts(!showPayouts)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800">
              {showPayouts ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="font-medium">Payouts ({payouts.length})</span>
              {payouts.length > 0 && <span className="text-xs text-emerald-600 font-semibold ml-1">Total: {money(m.totalPayouts)}</span>}
            </button>
            <button onClick={() => setAddingPayout(true)} className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded border border-emerald-200">
              <Award size={12} /> Record Payout
            </button>
          </div>

          {/* Payout form */}
          {addingPayout && (
            <div className="px-4 pb-3">
              <PayoutForm
                currentBalance={m.currentBal}
                firmData={f}
                onSave={handleAddPayout}
                onCancel={() => setAddingPayout(false)}
                payoutNumber={payouts.length + 1}
              />
            </div>
          )}

          {/* Payout history */}
          {showPayouts && payouts.length > 0 && (
            <div className="px-4 pb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left py-1 px-1 font-medium">Date</th>
                    <th className="text-right py-1 px-1 font-medium">Payout</th>
                    <th className="text-right py-1 px-1 font-medium">Net (after split)</th>
                    <th className="text-right py-1 px-1 font-medium">New Balance</th>
                    <th className="text-left py-1 px-1 font-medium">Notes</th>
                    <th className="py-1 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...payouts].reverse().map(p => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-emerald-50/30">
                      <td className="py-1.5 px-1 text-gray-600">{p.date}</td>
                      <td className="py-1.5 px-1 text-right font-semibold text-emerald-600">{money(p.amount)}</td>
                      <td className="py-1.5 px-1 text-right text-emerald-700">{money(p.netAmount || p.amount)}</td>
                      <td className="py-1.5 px-1 text-right font-medium">{money(p.newBalance)}</td>
                      <td className="py-1.5 px-1 text-gray-500 text-xs max-w-[150px] truncate">{p.notes || ""}</td>
                      <td className="py-1.5 px-1 text-right">
                        <button onClick={() => handleDeletePayout(p.id)} className="p-0.5 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 text-xs font-semibold text-gray-600">
                    <td className="py-1.5 px-1">Total ({payouts.length})</td>
                    <td className="py-1.5 px-1 text-right text-emerald-600">{money(payouts.reduce((s, p) => s + (p.amount || 0), 0))}</td>
                    <td className="py-1.5 px-1 text-right text-emerald-700">{money(payouts.reduce((s, p) => s + (p.netAmount || p.amount || 0), 0))}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reset — both phases (hidden entirely if firm has no resets AND no resets recorded) */}
      {!collapsed && f && (!f.noResets || resets.length > 0) && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 flex items-center justify-between">
            <button onClick={() => setShowResets(!showResets)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800">
              {showResets ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="font-medium">Resets ({resets.length})</span>
              {resets.length > 0 && <span className="text-xs text-amber-600 font-semibold ml-1">Cost: {money(resets.reduce((s, r) => s + (r.cost || 0), 0))}</span>}
              {f.noResets && <span className="text-[10px] text-gray-400 ml-1">(firm has no reset option)</span>}
            </button>
            {!f.noResets && (
              <button onClick={() => setAddingReset(true)} className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 rounded border border-amber-200">
                🔄 Reset Account
              </button>
            )}
          </div>

          {/* Reset form */}
          {addingReset && (
            <div className="px-4 pb-3">
              <ResetForm
                firmData={f}
                defaultCost={firmData?.resetPrice || 0}
                startBalance={account.startBalance || 50000}
                onSave={handleReset}
                onCancel={() => setAddingReset(false)}
              />
            </div>
          )}

          {/* Resets history */}
          {showResets && resets.length > 0 && (
            <div className="px-4 pb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left py-1 px-1 font-medium">#</th>
                    <th className="text-left py-1 px-1 font-medium">Date</th>
                    <th className="text-right py-1 px-1 font-medium">Cost</th>
                    <th className="text-right py-1 px-1 font-medium">New Balance</th>
                    <th className="text-left py-1 px-1 font-medium">Notes</th>
                    <th className="py-1 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...resets].reverse().map((r, i) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-amber-50/30">
                      <td className="py-1.5 px-1 text-gray-400 text-xs">{resets.length - i}</td>
                      <td className="py-1.5 px-1 text-gray-600">{r.date}</td>
                      <td className="py-1.5 px-1 text-right font-semibold text-red-600">{money(r.cost)}</td>
                      <td className="py-1.5 px-1 text-right font-medium">{money(r.newBalance)}</td>
                      <td className="py-1.5 px-1 text-gray-500 text-xs max-w-[150px] truncate">{r.notes || ""}</td>
                      <td className="py-1.5 px-1 text-right">
                        <button onClick={() => handleDeleteReset(r.id)} className="p-0.5 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 text-xs font-semibold text-gray-600">
                    <td colSpan={2} className="py-1.5 px-1">Total ({resets.length} reset{resets.length !== 1 ? "s" : ""})</td>
                    <td className="py-1.5 px-1 text-right text-red-600">{money(resets.reduce((s, r) => s + (r.cost || 0), 0))}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Resets to breakeven metric */}
          {resets.length > 0 && m.resetsToBreakeven != null && (
            <div className="px-4 pb-2">
              <div className={`text-xs px-2 py-1.5 rounded ${m.resetsToBreakeven > 0 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                <b>Resets left to breakeven at current reset price ({money(firmData?.resetPrice || resets[resets.length - 1]?.cost || 0)}):</b> {m.resetsToBreakeven > 0 ? m.resetsToBreakeven : "⚠️ Already exceeded — net loss from resets"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Journal */}
      {!collapsed && <div className="border-t border-gray-100">
        <button onClick={() => setShowJournal(!showJournal)} className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50">
          <span className="font-medium">Trading Journal ({m.cycleEntries} entries{m.payoutCount > 0 ? ` in current cycle • ${m.allEntriesCount} total` : ""})</span>
          {showJournal ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showJournal && (
          <div className="px-4 pb-3 space-y-2">
            {/* Add / Import buttons */}
            {!addingEntry && (
              <div className="flex items-center gap-2">
                <button onClick={() => setAddingEntry(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded border border-blue-200">
                  <Plus size={12} /> Log Today
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200">
                  📄 Import CSV
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleCsvImport} />
              </div>
            )}
            {importMsg && <div className="text-xs px-2 py-1 rounded bg-gray-50 border border-gray-200">{importMsg}</div>}
            {addingEntry && <JournalEntryForm onSave={handleAddEntry} onCancel={() => setAddingEntry(false)} />}

            {/* Journal table */}
            {entries.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left py-1 px-1 font-medium">Date</th>
                    <th className="text-right py-1 px-1 font-medium">Balance</th>
                    <th className="text-right py-1 px-1 font-medium">P&L</th>
                    <th className="text-right py-1 px-1 font-medium">Trades</th>
                    <th className="text-center py-1 px-1 font-medium">Flags</th>
                    <th className="text-left py-1 px-1 font-medium">Notes</th>
                    <th className="py-1 px-1 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map(e => {
                    const dd = m.dailyDetails?.find(d => d.date === e.date);
                    const flags = [];
                    if (dd?.dllBreach) flags.push({ icon: "DLL", color: "bg-red-100 text-red-700", tip: "Daily loss limit exceeded" });
                    if (dd?.mllBreach) flags.push({ icon: "MLL", color: "bg-red-600 text-white", tip: "Max loss breached" });
                    // Check if this day is the biggest day AND it causes consistency issues
                    if (m.biggestDayDate === e.date && m.consistencyAdjTarget > m.baseTarget) {
                      const tip = m.phase === "funded"
                        ? `This day is ${(m.consistencyPct * 100).toFixed(0)}% of total profit — DO NOT exceed this amount. Need more spread profit for payout eligibility.`
                        : `This day is ${(m.consistencyPct * 100).toFixed(0)}% of total profit — pushes target to ${money(m.consistencyAdjTarget)}`;
                      flags.push({ icon: `${(m.consistencyPct * 100).toFixed(0)}%`, color: "bg-amber-100 text-amber-700", tip });
                    }
                    return editingEntry === e.id ? (
                      <tr key={e.id}><td colSpan={7}><JournalEntryForm initial={e} onSave={handleUpdateEntry} onCancel={() => setEditingEntry(null)} /></td></tr>
                    ) : (
                      <tr key={e.id} className={`border-b border-gray-50 hover:bg-gray-50 ${dd?.dllBreach || dd?.mllBreach ? "bg-red-50/40" : ""}`}>
                        <td className="py-1.5 px-1 text-gray-600">{e.date}</td>
                        <td className="py-1.5 px-1 text-right font-medium">{money(e.balance)}</td>
                        {(() => { const displayPnl = dd ? dd.pnl : (e.pnl || 0); return (
                        <td className={`py-1.5 px-1 text-right font-semibold ${displayPnl > 0 ? "text-emerald-600" : displayPnl < 0 ? "text-red-600" : "text-gray-400"}`}>
                          {displayPnl > 0 ? "+" : ""}{money(displayPnl)}
                        </td>); })()}
                        <td className="py-1.5 px-1 text-right text-gray-500">{e.trades || "—"}</td>
                        <td className="py-1.5 px-1 text-center">
                          {flags.length > 0 ? (
                            <div className="flex items-center justify-center gap-0.5 flex-wrap">
                              {flags.map((fl, i) => (
                                <span key={i} className={`text-[9px] font-bold px-1 py-0.5 rounded ${fl.color}`} title={fl.tip}>{fl.icon}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-1 text-gray-500 text-xs max-w-[200px] truncate">{e.notes || ""}</td>
                        <td className="py-1.5 px-1 text-right">
                          <button onClick={() => setEditingEntry(e.id)} className="p-0.5 text-gray-300 hover:text-blue-500"><Pencil size={12} /></button>
                          <button onClick={() => handleDeleteEntry(e.id)} className="p-0.5 text-gray-300 hover:text-red-500 ml-1"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>}
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

  // ── Bulk import mode ──
  if (bulkAccounts) {
    const validCount = bulkAccounts.filter(a => !a.error).length;
    return (
      <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">{t("bulkImport", bulkAccounts.length)}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t("assignFirm")}</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-300">
            📄 {t("addMoreCsvs")}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" multiple className="hidden" onChange={handleCsvImport} />
        </div>

        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {bulkAccounts.map((a) => (
            <div key={a.key} className={`border rounded-lg p-3 ${a.error ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-start gap-3">
                {/* Label */}
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{t("label")}</label>
                  <input type="text" className="w-full border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500" value={a.label} onChange={e => updateBulkAccount(a.key, "label", e.target.value)} placeholder="Account name" />
                </div>
                {/* Firm */}
                <div className="w-48">
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{t("firm")}</label>
                  <select className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500" value={a.firmId} onChange={e => updateBulkAccount(a.key, "firmId", e.target.value)}>
                    <option value="">— Select —</option>
                    {firms.map(f => <option key={f.id} value={f.id}>{f.name} — {f.model}</option>)}
                  </select>
                </div>
                {/* Phase */}
                <div className="w-28">
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{t("phase")}</label>
                  <select className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500" value={a.phase} onChange={e => updateBulkAccount(a.key, "phase", e.target.value)}>
                    <option value="challenge">{t("challengeEval")}</option>
                    <option value="funded">{t("fundedPayout")}</option>
                  </select>
                </div>
                {/* Start Bal */}
                <div className="w-28">
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{t("startBal")}</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500" value={a.startBalance} onChange={e => updateBulkAccount(a.key, "startBalance", Number(e.target.value))} />
                </div>
                {/* Start Date */}
                <div className="w-32">
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{t("startDate")}</label>
                  <input type="date" className="w-full border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500" value={a.startDate} onChange={e => updateBulkAccount(a.key, "startDate", e.target.value)} />
                </div>
                {/* Remove */}
                <button onClick={() => removeBulkAccount(a.key)} className="mt-4 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
              </div>
              <div className={`text-[10px] mt-1 ${a.error ? "text-red-600" : "text-gray-500"}`}>
                {a.error ? a.summary : `${a.entryCount} journal entries • ${a.summary}`}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => { setBulkAccounts(null); setImportMsg(null); }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
          <button onClick={handleBulkSave} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
            {t("importAccounts", validCount, validCount !== 1 ? "s" : "")}
          </button>
        </div>
      </div>
    );
  }

  // ── Single account mode ──
  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 space-y-3">
      <h3 className="font-bold text-gray-800">{t("trackNewAccount")}</h3>

      {/* CSV Import section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-blue-800">{t("quickStartCsv")}</div>
            <div className="text-[10px] text-blue-600">{t("csvImportDesc")}</div>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-100 rounded border border-blue-300 shadow-sm">
            📄 {t("importCsvs")}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" multiple className="hidden" onChange={handleCsvImport} />
        </div>
        {importMsg && <div className="text-xs px-2 py-1 rounded bg-white border border-blue-200">{importMsg}</div>}
        {importedJournal && (
          <div className="text-[10px] text-blue-700">{t("startTrackingEntries", importedJournal.length)}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("linkToFirm")}</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" value={firmId} onChange={e => setFirmId(e.target.value)}>
            {firms.map(f => <option key={f.id} value={f.id}>{f.name} — {f.model}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("phase")}</label>
          {selectedFirm?.instant ? (
            <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">{t("fundedInstant")}</div>
          ) : (
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" value={phase} onChange={e => setPhase(e.target.value)}>
              <option value="challenge">{t("challengeEval")}</option>
              <option value="funded">{t("fundedPayout")}</option>
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("label")} {importedJournal && label ? "" : "(optional)"}</label>
          <input type="text" className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${importedJournal && label ? "border-blue-400 bg-blue-50/50" : "border-gray-300"}`} value={label} onChange={e => setLabel(e.target.value)} placeholder={selectedFirm ? `${selectedFirm.name} ${selectedFirm.model}` : "My account"} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("startBalance")}</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <input type="number" className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${importedJournal ? "border-blue-400 bg-blue-50/50" : "border-gray-300"}`} value={startBalance} onChange={e => setStartBalance(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("startDate")}</label>
          <input type="date" className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${importedJournal ? "border-blue-400 bg-blue-50/50" : "border-gray-300"}`} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
        <button onClick={() => {
          if (!firmId) { alert(t("alertSelectFirm")); return; }
          const effectivePhase = selectedFirm?.instant ? "funded" : phase;
          onSave({ id: nextAccountId++, firmId: Number(firmId), phase: effectivePhase, label, startBalance, startDate, journal: importedJournal || [], status: "active" });
        }} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
          {importedJournal ? t("startTrackingEntries", importedJournal.length) : t("startTracking")}
        </button>
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

  const pnlClr = v => v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "text-gray-500";
  const roiClr = v => v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "text-gray-400";
  const monthName = m => {
    try { const [y, mo] = m.split("-"); return new Date(y, mo - 1).toLocaleString("default", { month: "short", year: "numeric" }); } catch { return m; }
  };

  if (accounts.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">No accounts yet</p>
        <p className="text-sm mt-1">Start tracking accounts to see your financial dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">Financial Dashboard</h2>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-gray-400">Total Expenses</div>
            <div className="text-xl font-bold text-red-600">{money(data.totalExpenses)}</div>
            <div className="text-[10px] text-gray-400">eval fees + activations + resets</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-gray-400">Total Income</div>
            <div className="text-xl font-bold text-emerald-600">{money(data.totalIncome)}</div>
            <div className="text-[10px] text-gray-400">{data.payoutCount} payout{data.payoutCount !== 1 ? "s" : ""} (net after split)</div>
          </div>
          <div className={`bg-white border ${data.actualPnl >= 0 ? "border-emerald-200" : "border-red-200"} rounded-xl p-3 text-center shadow-sm`}>
            <div className="text-xs font-medium text-gray-400">Actual P&L</div>
            <div className={`text-xl font-bold ${pnlClr(data.actualPnl)}`}>{data.actualPnl >= 0 ? "+" : ""}{money(data.actualPnl)}</div>
            <div className="text-[10px] text-gray-400">income − expenses</div>
          </div>
          <div className={`bg-white border ${data.actualRoi >= 0 ? "border-emerald-200" : "border-red-200"} rounded-xl p-3 text-center shadow-sm`}>
            <div className="text-xs font-medium text-gray-400">Actual ROI</div>
            <div className={`text-xl font-bold ${roiClr(data.actualRoi)}`}>{data.actualRoi >= 0 ? "+" : ""}{(data.actualRoi * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400">P&L ÷ expenses</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-gray-400">Avg Payout</div>
            <div className="text-xl font-bold text-gray-700">{data.avgPayout > 0 ? money(data.avgPayout) : "—"}</div>
            <div className="text-[10px] text-gray-400">{data.costPerPayout != null ? `cost/payout: ${money(data.costPerPayout)}` : "no payouts yet"}</div>
          </div>
        </div>
        {/* Secondary stats row */}
        <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
          <span>Accounts: <b className="text-gray-700">{data.totalAccounts}</b></span>
          <span>Funded: <b className="text-gray-700">{data.fundedAccounts}</b></span>
          <span>Got payouts: <b className="text-emerald-600">{data.accountsWithPayouts}</b></span>
          {data.totalResets > 0 && <span>Resets: <b className="text-amber-600">{data.totalResets}</b> ({money(data.totalResetCosts)})</span>}
          <span>Success rate: <b className={data.accountsWithPayouts > 0 ? "text-emerald-600" : "text-gray-400"}>{data.totalAccounts > 0 ? ((data.accountsWithPayouts / data.totalAccounts) * 100).toFixed(0) : 0}%</b> of accounts</span>
          {data.actualPnl < 0 && data.avgPayout > 0 && (
            <span>Break-even in: <b className="text-amber-600">{Math.ceil(Math.abs(data.actualPnl) / data.avgPayout)} more payout{Math.ceil(Math.abs(data.actualPnl) / data.avgPayout) !== 1 ? "s" : ""}</b></span>
          )}
        </div>
      </div>

      {/* ── By Firm ── */}
      {data.firmRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-700">By Firm</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50/50">
                <th className="text-left py-2 px-3 font-medium">Firm</th>
                <th className="text-right py-2 px-3 font-medium">Accounts</th>
                <th className="text-right py-2 px-3 font-medium">Expenses</th>
                <th className="text-right py-2 px-3 font-medium">Income</th>
                <th className="text-right py-2 px-3 font-medium">P&L</th>
                <th className="text-right py-2 px-3 font-medium">ROI</th>
                <th className="text-right py-2 px-3 font-medium">Payouts</th>
              </tr>
            </thead>
            <tbody>
              {data.firmRows.map(r => (
                <tr key={r.firmName} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-700">{r.firmName}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{r.accountCount}</td>
                  <td className="py-2 px-3 text-right text-red-600">{money(r.expenses)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{money(r.income)}</td>
                  <td className={`py-2 px-3 text-right font-semibold ${pnlClr(r.pnl)}`}>{r.pnl >= 0 ? "+" : ""}{money(r.pnl)}</td>
                  <td className={`py-2 px-3 text-right ${roiClr(r.roi)}`}>{r.expenses > 0 ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}%` : "—"}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{r.payouts}</td>
                </tr>
              ))}
            </tbody>
            {data.firmRows.length > 1 && (
              <tfoot>
                <tr className="border-t border-gray-200 text-xs font-semibold text-gray-600 bg-gray-50/50">
                  <td className="py-2 px-3">Total</td>
                  <td className="py-2 px-3 text-right">{data.totalAccounts}</td>
                  <td className="py-2 px-3 text-right text-red-600">{money(data.totalExpenses)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{money(data.totalIncome)}</td>
                  <td className={`py-2 px-3 text-right font-bold ${pnlClr(data.actualPnl)}`}>{data.actualPnl >= 0 ? "+" : ""}{money(data.actualPnl)}</td>
                  <td className={`py-2 px-3 text-right ${roiClr(data.actualRoi)}`}>{data.totalExpenses > 0 ? `${data.actualRoi >= 0 ? "+" : ""}${(data.actualRoi * 100).toFixed(0)}%` : "—"}</td>
                  <td className="py-2 px-3 text-right">{data.payoutCount}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── By Month ── */}
      {data.monthRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-700">By Month</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50/50">
                <th className="text-left py-2 px-3 font-medium">Month</th>
                <th className="text-right py-2 px-3 font-medium">Expenses</th>
                <th className="text-right py-2 px-3 font-medium">Income</th>
                <th className="text-right py-2 px-3 font-medium">P&L</th>
                <th className="text-right py-2 px-3 font-medium">ROI</th>
                <th className="text-right py-2 px-3 font-medium">Payouts</th>
                <th className="text-right py-2 px-3 font-medium">Cumulative P&L</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let cum = 0;
                return [...data.monthRows].reverse().map(r => {
                  cum += r.pnl;
                  return { ...r, cumPnl: cum };
                }).reverse().map(r => (
                  <tr key={r.month} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-700">{monthName(r.month)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{r.expenses > 0 ? money(r.expenses) : "—"}</td>
                    <td className="py-2 px-3 text-right text-emerald-600">{r.income > 0 ? money(r.income) : "—"}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${pnlClr(r.pnl)}`}>{r.pnl >= 0 ? "+" : ""}{money(r.pnl)}</td>
                    <td className={`py-2 px-3 text-right ${roiClr(r.roi)}`}>{r.expenses > 0 ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}%` : "—"}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{r.payouts > 0 ? r.payouts : "—"}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${pnlClr(r.cumPnl)}`}>{r.cumPnl >= 0 ? "+" : ""}{money(r.cumPnl)}</td>
                  </tr>
                ));
              })()}
            </tbody>
            {/* YTD total */}
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
                  <tr className="border-t-2 border-gray-200 bg-gray-50/80 text-xs font-bold text-gray-700">
                    <td className="py-2.5 px-3">YTD {currentYear}</td>
                    <td className="py-2.5 px-3 text-right text-red-600">{ytdExpenses > 0 ? money(ytdExpenses) : "—"}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600">{ytdIncome > 0 ? money(ytdIncome) : "—"}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${pnlClr(ytdPnl)}`}>{ytdPnl >= 0 ? "+" : ""}{money(ytdPnl)}</td>
                    <td className={`py-2.5 px-3 text-right ${roiClr(ytdRoi)}`}>{ytdExpenses > 0 ? `${ytdRoi >= 0 ? "+" : ""}${(ytdRoi * 100).toFixed(0)}%` : "—"}</td>
                    <td className="py-2.5 px-3 text-right">{ytdPayouts > 0 ? ytdPayouts : "—"}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${pnlClr(ytdPnl)}`}>{ytdPnl >= 0 ? "+" : ""}{money(ytdPnl)}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}

      {/* ── By Year ── */}
      {data.yearRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-700">By Year</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50/50">
                <th className="text-left py-2 px-3 font-medium">Year</th>
                <th className="text-right py-2 px-3 font-medium">Expenses</th>
                <th className="text-right py-2 px-3 font-medium">Income</th>
                <th className="text-right py-2 px-3 font-medium">P&L</th>
                <th className="text-right py-2 px-3 font-medium">ROI</th>
                <th className="text-right py-2 px-3 font-medium">Payouts</th>
              </tr>
            </thead>
            <tbody>
              {data.yearRows.map(r => (
                <tr key={r.year} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-700">{r.year}</td>
                  <td className="py-2 px-3 text-right text-red-600">{money(r.expenses)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{money(r.income)}</td>
                  <td className={`py-2 px-3 text-right font-semibold ${pnlClr(r.pnl)}`}>{r.pnl >= 0 ? "+" : ""}{money(r.pnl)}</td>
                  <td className={`py-2 px-3 text-right ${roiClr(r.roi)}`}>{r.expenses > 0 ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}%` : "—"}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{r.payouts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function AccountTracker({ accounts, onUpdate, firms }) {
  const [adding, setAdding] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
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

  const activeAccounts = accounts.filter(a => a.status !== "archived");
  const archivedAccounts = accounts.filter(a => a.status === "archived");

  // Compute metrics for filtering/sorting (memoize-ish)
  const withMetrics = useMemo(() => activeAccounts.map(acc => {
    const firmData = firms.find(f => f.id === acc.firmId);
    const m = calcLiveMetrics(acc, firmData);
    return { acc, firmData, m };
  }), [activeAccounts, firms]);

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
        if (filterStatus === "target_hit") return m.allRulesMet;
        if (filterStatus === "breached") return m.mllBreached || m.ddPct <= 0;
        if (filterStatus === "active") return !m.allRulesMet && !m.mllBreached && m.ddPct > 0;
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

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t("trackAccount")}</h2>
          <p className="text-xs text-gray-500">{t("clickTrackAccount")}</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
            <Plus size={16} /> {t("trackNewAccount")}
          </button>
        )}
      </div>

      {adding && <NewAccountForm firms={firms} onSave={handleSaveAccount} onSaveBulk={handleSaveBulk} onCancel={() => setAdding(false)} />}

      {/* Search, filter, sort toolbar */}
      {activeAccounts.length > 0 && (() => {
        const visibleIds = sorted.map(s => s.acc.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
        const someSelected = selectedIds.size > 0;
        return (
        <div className="space-y-0">
          <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            {/* Select all checkbox */}
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title={allVisibleSelected ? "Deselect all" : "Select all shown"}>
              <input type="checkbox" className="accent-blue-600 w-3.5 h-3.5" checked={allVisibleSelected} onChange={() => {
                if (allVisibleSelected) {
                  setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.delete(id)); return next; });
                } else {
                  setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.add(id)); return next; });
                }
              }} />
              <span className="text-[10px] text-gray-500 select-none">{allVisibleSelected ? "All" : ""}</span>
            </label>
            {/* Search */}
            <div className="flex-1 min-w-[180px]">
              <input type="text" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400" placeholder={t("searchAccounts")} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {/* Phase filter */}
            <select className="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500" value={filterPhase} onChange={e => setFilterPhase(e.target.value)}>
              <option value="all">{t("allPhases")}</option>
              <option value="challenge">{t("challenge")}</option>
              <option value="funded">{t("funded")}</option>
            </select>
            {/* Status filter */}
            <select className="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">{t("allStatuses")}</option>
              <option value="active">{t("statusActive")}</option>
              <option value="target_hit">{t("targetHitPayout")}</option>
              <option value="breached">{t("breached")}</option>
            </select>
            {/* Sort */}
            <select className="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500" value={sortKey} onChange={e => setSortKey(e.target.value)}>
              {getTrackerSortOpts().map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {/* Collapse / Expand all */}
            <div className="border-l border-gray-200 pl-2 flex items-center gap-1">
              <button onClick={allCollapsed ? expandAll : collapseAll} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded border border-gray-200" title={allCollapsed ? t("expandAll") : t("collapseAll")}>
                {allCollapsed ? t("expandAll") : t("collapseAll")}
              </button>
            </div>
            {/* Result count */}
            {(search || filterPhase !== "all" || filterStatus !== "all") && (
              <span className="text-[10px] text-gray-400">{sorted.length}/{activeAccounts.length} shown</span>
            )}
          </div>
          {/* Selection action bar */}
          {someSelected && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 border-t-0 rounded-b-lg px-3 py-1.5 -mt-1">
              <span className="text-xs font-medium text-blue-800">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-600 hover:text-blue-800 underline">{t("deselectAll")}</button>
              <div className="flex-1" />
              <button onClick={handleDeleteSelected} className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200">
                <Trash2 size={12} /> {t("deleteSelected")}
              </button>
            </div>
          )}
        </div>);
      })()}

      {activeAccounts.length === 0 && !adding && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{t("noAccountsYet")}</p>
          <p className="text-sm mt-1">{t("clickTrackAccount")}</p>
        </div>
      )}

      {sorted.length === 0 && activeAccounts.length > 0 && !adding && (
        <div className="text-center py-8 text-gray-400 text-sm">{t("noAccountsMatch")}</div>
      )}

      {sorted.map(({ acc, firmData }) => (
        <AccountCard key={acc.id} account={acc} firmData={firmData} onUpdate={handleUpdateAccount} onDelete={handleDeleteAccount} collapsed={collapsedIds.has(acc.id)} onToggleCollapse={() => toggleCollapse(acc.id)} selected={selectedIds.has(acc.id)} onToggleSelect={() => toggleSelect(acc.id)} />
      ))}

      {archivedAccounts.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">Archived accounts ({archivedAccounts.length})</summary>
          <div className="mt-2 space-y-3 opacity-60">
            {archivedAccounts.map(acc => {
              const firmData = firms.find(f => f.id === acc.firmId);
              return <AccountCard key={acc.id} account={acc} firmData={firmData} onUpdate={handleUpdateAccount} onDelete={handleDeleteAccount} collapsed={collapsedIds.has(acc.id)} onToggleCollapse={() => toggleCollapse(acc.id)} />;
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

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">{t("authRequiredTitle")}</h2>
        <p className="text-gray-500 text-center mb-6 text-sm">{t("authRequiredDesc")}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600 text-sm">{successMessage}</p>
          </div>
        )}

        <form onSubmit={doAuth} className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-1">{t("authEmail")}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-1">{t("authPassword")}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors">
            {loading ? "..." : isSignUp ? t("authSignUpBtn") : t("authSignInBtn")}
          </button>
        </form>

        <div className="mt-5 flex items-center gap-4">
          <div className="flex-1 border-t border-gray-200"></div>
          <span className="text-gray-400 text-sm">{t("authOr")}</span>
          <div className="flex-1 border-t border-gray-200"></div>
        </div>

        <button onClick={doGoogle} disabled={loading}
          className="w-full mt-5 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {t("authGoogleBtn")}
        </button>

        <p className="mt-5 text-center text-gray-500 text-sm">
          {isSignUp ? t("authToggleSignIn") : t("authToggleSignUp")}
          <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccessMessage(""); }}
            className="ml-2 text-blue-600 hover:text-blue-800 font-semibold transition-colors">
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
    <div className="max-w-2xl mx-auto mt-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Shield size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">{t("adminTitle")}</h2>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">{success}</div>}

        {/* Add admin form */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t("adminEmailPlaceholder")}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
            <UserPlus size={16} /> {t("adminAdd")}
          </button>
        </form>

        {/* Admin list */}
        {loading ? (
          <p className="text-gray-400 text-sm">{t("loading")}...</p>
        ) : (
          <div className="space-y-2">
            {admins.map(admin => (
              <div key={admin.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-700">{admin.user_id}</span>
                  {admin.user_id === currentUserId && <span className="ml-2 text-xs text-blue-600 font-semibold">({t("adminYou")})</span>}
                </div>
                {admin.user_id !== currentUserId && (
                  <button onClick={() => handleRemove(admin.user_id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                    <UserMinus size={14} /> {t("adminRemove")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading your data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-slate-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award size={28} className="text-yellow-400" />
              <div>
                <h1 className="text-xl font-bold">{t("appTitle")}</h1>
                <p className="text-xs text-slate-400">{t("appSubtitle", firms.length)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleLang} className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-slate-700 transition-colors flex items-center gap-1 text-xs font-semibold" title={lang === "en" ? "Schimbă în Română" : "Switch to English"}>
                <Globe size={15} /> {lang === "en" ? "RO" : "EN"}
              </button>
              <button onClick={() => setDarkMode(d => !d)} className="p-2 rounded-lg text-slate-400 hover:text-yellow-300 hover:bg-slate-700 transition-colors" title={darkMode ? t("lightMode") : t("darkMode")}>
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {session && isAdmin && (
                <button onClick={() => setEditing({})} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                  <Plus size={16} /> {t("addFirm")}
                </button>
              )}
              {session ? (
                <button onClick={onSignOut} className="p-2 rounded-lg text-slate-400 hover:text-red-300 hover:bg-slate-700 transition-colors" title={t("authSignOut")}>
                  <LogOut size={18} />
                </button>
              ) : (
                <button onClick={() => setTab("login")} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors">
                  {t("authSignIn")}
                </button>
              )}
            </div>
          </div>
          {best && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-slate-400">{t("topPick")}</span>
              <span className="font-semibold text-yellow-300">{best.name}</span>
              <span className="text-slate-400">—</span>
              <span className="text-emerald-300">{pct(best.overallEase)} {t("overallEase")}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-300">{money(best.maxNetProfit)} {t("maxProfit")}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-300">{money(best.totalCost)} {t("cost")}</span>
            </div>
          )}
          {/* TABS */}
          <div className="flex gap-1 mt-3 -mb-px flex-wrap">
            <button onClick={() => setTab("compare")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "compare" ? "bg-gray-50 text-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {t("tabComparison")}
            </button>
            <button onClick={() => setTab("details")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "details" ? "bg-gray-50 text-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {t("tabDetails")}
            </button>
            <button onClick={() => session ? setTab("tracker") : setTab("login")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1 ${tab === "tracker" ? "bg-gray-50 text-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {!session && <Lock size={12} />}
              {t("tabTracker")}{session && accounts.length > 0 ? ` (${accounts.filter(a => a.status !== "archived").length})` : ""}
            </button>
            <button onClick={() => session ? setTab("dashboard") : setTab("login")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1 ${tab === "dashboard" ? "bg-gray-50 text-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {!session && <Lock size={12} />}
              {t("tabDashboard")}
            </button>
            <button onClick={() => setTab("metrics")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "metrics" ? "bg-gray-50 text-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {t("tabMetrics")}
            </button>
            {session && isAdmin && (
              <button onClick={() => setTab("admin")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1 ${tab === "admin" ? "bg-gray-50 text-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
                <Shield size={14} /> {t("tabAdmin")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {tab === "compare" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">{t("clickToSort")}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> {t("easeGreen")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> {t("easeAmber")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> {t("easeRed")}</span>
              </div>
            </div>
            <ComparisonTable firms={computed} sortKey={sortBy} onSort={setSortBy} onFirmClick={handleFirmClick} />
            <div className="mt-4">
              <HowItWorks open={showGuide} onToggle={() => setShowGuide(!showGuide)} />
            </div>
          </>
        )}

        {tab === "details" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium">Sort:</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {getSortOpts().map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <HowItWorks open={showGuide} onToggle={() => setShowGuide(!showGuide)} />
            </div>

            <div className="space-y-3">
              {computed.map((firm, i) => (
                <div key={firm.id} id={`firm-${firm.id}`}>
                  <FirmCard firm={firm} rank={i + 1} onEdit={isAdmin ? (f => setEditing(f)) : null} onDelete={isAdmin ? handleDelete : null} />
                </div>
              ))}
            </div>

            {computed.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg">{t("noFirmsYet")}</p>
                {isAdmin && <p className="text-sm mt-1">{t("clickAddFirm")}</p>}
              </div>
            )}
          </>
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
    </div>
  );
}