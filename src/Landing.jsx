// ═══════════════════════════════════════════════════════════
//  Landing page — marketing + waitlist capture.
//
//  Served at `/`. The authed product lives at `/app`. This file is
//  deliberately self-contained: one big component that renders the
//  whole page top-to-bottom, since reusable landing-sections don't
//  exist anywhere else in the codebase and premature abstraction
//  here would just bloat ui.jsx.
//
//  Theme: matches the app's slate+amber+blue palette with a denser
//  typographic scale (text-5xl hero) and more generous section
//  padding (py-20 desktop / py-12 mobile).
// ═══════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import {
  Award, ArrowRight, Check, ChevronDown, Briefcase, Target, Layers,
  Shield, Zap, BarChart3, LineChart, Building2, BookOpen,
  TrendingUp, Mail, Globe, Sun, Moon,
} from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { BrandMark } from "./shell.jsx";

// ── UTM capture (first-touch attribution) ──────────────────────────────────
// On first visit, parse utm_* params from the URL and persist them in
// localStorage for up to 30 days. When the user finally signs up — possibly
// days later, possibly after navigating around — we send those original
// values along with the email. This is what tells the marketing prompt
// which posts/threads/replies are actually converting.
//
// First-touch (not last-touch): we keep the originating UTM even if a later
// visit lacks them. Pre-launch we care about *what brought them in*, not
// *what triggered the click*.
const UTM_KEY = "ppfa.utm";
const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function readPersistedUtm() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.capturedAt) return null;
    if (Date.now() - parsed.capturedAt > UTM_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function captureFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const utm = {
    utm_source:   p.get("utm_source")   || null,
    utm_medium:   p.get("utm_medium")   || null,
    utm_campaign: p.get("utm_campaign") || null,
    referrer:     (typeof document !== "undefined" && document.referrer) || null,
    landing_path: window.location.pathname || null,
    capturedAt:   Date.now(),
  };
  // Only persist if we got at least one UTM param — otherwise direct/organic
  // visits would overwrite a prior real attribution.
  const hasUtm = utm.utm_source || utm.utm_medium || utm.utm_campaign;
  if (hasUtm) {
    try { localStorage.setItem(UTM_KEY, JSON.stringify(utm)); } catch { /* noop */ }
  }
  return utm;
}

function getAttribution() {
  // Prefer existing first-touch over fresh URL.
  const existing = readPersistedUtm();
  if (existing) return existing;
  return captureFromUrl();
}

// Detect user's preferred theme. We don't use i18n on the landing page
// — it's English-only for MVP since the waitlist is global-reach.
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("ppfa.darkMode");
    if (stored != null) return stored === "1";
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false;
  });
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark"); else root.classList.remove("dark");
    try { localStorage.setItem("ppfa.darkMode", dark ? "1" : "0"); } catch { /* noop */ }
  }, [dark]);
  return [dark, setDark];
}

// ── Waitlist form: handles submit + dedup + success state ──────────────────
// `onSuccess` is fired only on a brand-new signup (not on duplicate-email
// "already on the list" — that one didn't add a row, so the count shouldn't
// tick). The Landing component uses this to optimistically increment the
// displayed count.
function WaitlistForm({ size = "md", autoFocus = false, className, onSuccess }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | already | error
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("loading");
    try {
      // First-touch UTM capture. The function tries persisted localStorage
      // first, then falls back to the current URL's utm_* params.
      const attr = getAttribution() || {};
      const { error: err } = await supabase
        .from("waitlist")
        .insert({
          email: trimmed,
          source: "landing",
          utm_source:   attr.utm_source   || null,
          utm_medium:   attr.utm_medium   || null,
          utm_campaign: attr.utm_campaign || null,
          referrer:     attr.referrer     || null,
          landing_path: attr.landing_path || null,
          user_agent:   typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : null,
        });
      if (err) {
        // 23505 = unique violation (already on the list). Treat as a friendly success.
        if (err.code === "23505" || /duplicate/i.test(err.message)) {
          setStatus("already");
          return;
        }
        // 23514 = check constraint violation (bad email format)
        if (err.code === "23514") {
          setStatus("error");
          setError("That doesn't look like a valid email address.");
          return;
        }
        setStatus("error");
        setError(err.message || "Something went wrong. Try again?");
        return;
      }
      setStatus("success");
      if (typeof onSuccess === "function") onSuccess();
    } catch (err) {
      setStatus("error");
      setError(err.message || "Network error. Try again?");
    }
  };

  const inputH = size === "lg" ? "h-12" : "h-11";
  const btnH  = size === "lg" ? "h-12 px-5 text-[14px]" : "h-11 px-4 text-[13.5px]";

  if (status === "success" || status === "already") {
    return (
      <div
        role="status"
        className={`flex items-center gap-2.5 rounded-none border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 ${className || ""}`}
      >
        <Check size={16} strokeWidth={2.5} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <span className="font-semibold">
            {status === "already" ? "You're already on the list 👍" : "You're in — check your inbox."}
          </span>
          {status === "success" && (
            <span className="ml-1 text-emerald-800 dark:text-emerald-200">We'll ping you when early access drops.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className || ""}>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row" noValidate>
        <div className="relative flex-1">
          <Mail
            size={15}
            strokeWidth={2.25}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus={autoFocus}
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={status === "loading"}
            placeholder="you@example.com"
            aria-label="Email address"
            className={`w-full ${inputH} rounded-none border border-slate-300 bg-white pl-9 pr-3 text-[14px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500`}
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className={`${btnH} inline-flex shrink-0 items-center justify-center gap-1.5 rounded-none bg-amber-500 font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950`}
        >
          {status === "loading" ? "Joining…" : "Join waitlist"}
          {status !== "loading" && <ArrowRight size={14} strokeWidth={2.5} />}
        </button>
      </form>
      {status === "error" && (
        <div role="alert" className="mt-2 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Mock product preview — pure CSS/SVG representation of the Account Tracker
//    so the hero has a visual without needing a real screenshot asset.
function MockTracker() {
  return (
    <div className="relative w-full max-w-[520px] select-none">
      {/* Browser chrome */}
      <div className="rounded-none border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/5">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <div className="ml-3 h-5 flex-1 rounded-none bg-slate-100 dark:bg-slate-800" />
        </div>

        {/* Fake unified objective card */}
        <div className="space-y-2.5 p-3.5">
          <div className="rounded-none border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <div className="flex h-5 w-5 items-center justify-center bg-amber-500">
                <Zap size={10} strokeWidth={3} className="text-slate-950" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11.5px] font-semibold text-slate-900 dark:text-slate-100">Trade Copier — Unified Plan</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-none bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1 w-1 rounded-full bg-emerald-500" /> 3/3 active
              </span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
              <MockCell label="Daily Target" value="$1,079" tone="emerald" icon={Target} />
              <MockCell label="Contracts" value="1" tone="blue" icon={Layers} />
              <MockCell label="Max Loss" value="−$1,000" tone="red" icon={Shield} />
            </div>
          </div>

          {/* Fake account rows — synthetic IDs only. Never use real account
              numbers in the marketing preview. */}
          <MockRow badge="CHALLENGE" badgeTone="amber" label="DEMO-CHAL-50K-A91F"  pnl="+$3,359" dd="100%" ok />
          <MockRow badge="CHALLENGE" badgeTone="amber" label="DEMO-CHAL-100K-K42B" pnl="+$3,294" dd="100%" ok />
          <MockRow badge="FUNDED"    badgeTone="blue"  label="DEMO-FUND-25K-Z78D"  pnl="$0"      dd="100%" ok />
        </div>
      </div>

      {/* Brand identity forbids glow effects — flat by design. No backdrop. */}
    </div>
  );
}

function MockCell({ label, value, tone, icon: Icon }) {
  const accentMap = {
    blue:    "text-blue-700 dark:text-blue-400",
    red:     "text-red-600 dark:text-red-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
  };
  return (
    <div className="px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {Icon && <Icon size={10} strokeWidth={2.25} className="text-slate-400" />}
        <span>{label}</span>
      </div>
      <div className={`mt-0.5 text-[17px] font-semibold font-mono tabular-nums leading-tight ${accentMap[tone] || "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function MockRow({ badge, badgeTone, label, pnl, dd, ok }) {
  const badgeCls =
    badgeTone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
    : badgeTone === "blue" ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"
    : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
  return (
    <div className="flex items-center gap-2 rounded-none border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <span className={`inline-flex h-4 items-center rounded-none border px-1.5 text-[9px] font-semibold uppercase tracking-wide ${badgeCls}`}>{badge}</span>
      <span className="truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100">{label}</span>
      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
        <span>Active</span>
      </span>
      <span className="font-mono tabular-nums text-[10.5px] text-slate-600 dark:text-slate-400">
        P&amp;L <b className="text-emerald-600 dark:text-emerald-400">{pnl}</b>
      </span>
      <span className="font-mono tabular-nums text-[10.5px] text-slate-600 dark:text-slate-400 hidden md:inline">
        DD <b className="text-emerald-600 dark:text-emerald-400">{dd}</b>
      </span>
    </div>
  );
}

// ── FAQ accordion ──────────────────────────────────────────────────────────
function FaqItem({ q, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
      >
        <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{q}</span>
        <ChevronDown
          size={18}
          strokeWidth={2.25}
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="pb-5 pr-6 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main Landing component ─────────────────────────────────────────────────
export default function Landing() {
  const [dark, setDark] = useDarkMode();
  const waitlistRef = useRef(null);
  const faqRef = useRef(null);

  // Live waitlist counter — shown as social proof under the form.
  // Backed by the SECURITY DEFINER RPC `waitlist_count()` so anon clients
  // can read the count without being able to enumerate any row data.
  // We bump optimistically on a successful submit so the user sees their
  // own contribution immediately.
  const [waitlistCount, setWaitlistCount] = useState(null);

  // Capture UTM on first paint so attribution is locked in even if the user
  // bounces without filling the form. WaitlistForm reads localStorage at
  // submit time — this effect just makes sure the entry is there early.
  useEffect(() => { getAttribution(); }, []);

  // Fetch the live count once on mount. Failures are silently ignored —
  // microcopy falls back to the generic "no spam" line.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("waitlist_count");
        if (cancelled) return;
        if (!error && typeof data === "number") setWaitlistCount(data);
      } catch { /* network blip — don't break the page */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignupSuccess = () => {
    setWaitlistCount(c => (c == null ? c : c + 1));
  };

  const scrollTo = (ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      {/* ── NAV ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="flex min-w-0 items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">
            <BrandMark size="md" />
            <span className="hidden text-[10.5px] leading-tight text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wide sm:inline">prop firm rules, decoded</span>
          </a>
          <nav className="flex items-center gap-1">
            <button type="button" onClick={() => scrollTo(faqRef)} className="hidden h-8 rounded-none px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white sm:inline-flex">FAQ</button>
            <a href="/app" className="hidden h-8 items-center rounded-none px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white sm:inline-flex">Preview app</a>
            <button
              type="button"
              onClick={() => setDark(v => !v)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-none text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
            >
              {dark ? <Sun size={14} strokeWidth={2.25} /> : <Moon size={14} strokeWidth={2.25} />}
            </button>
            <button
              type="button"
              onClick={() => scrollTo(waitlistRef)}
              className="ml-1 inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-none bg-amber-500 px-3 text-[13px] font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              <span className="hidden sm:inline">Join waitlist</span>
              <span className="sm:hidden">Join</span>
              <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          </nav>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section ref={waitlistRef} className="relative overflow-hidden">
        {/* Brand: flat — no gradient hero backdrop. The navy bg carries it. */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:py-24">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-none border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <Briefcase size={11} strokeWidth={2.5} />
              For futures prop-firm traders
            </div>
            <h1 className="mt-5 text-[28px] font-semibold leading-[1.1] tracking-tight [text-wrap:balance] sm:text-[36px] lg:text-[46px]">
              Prop firm rules, <span className="text-amber-500">in plain English</span>.
              <span className="block text-slate-700 dark:text-slate-300">Plus a daily plan that keeps your account alive.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[16px]">
              Stop guessing which firm to buy, which rules bite, or how many contracts to trade today.
              One dashboard for <b className="text-slate-900 dark:text-slate-200">20+ plans</b> across the major firms, all your accounts, and every payout — auto-calculated from your live balance.
            </p>
            <WaitlistForm size="lg" className="mt-6 max-w-lg" onSuccess={handleSignupSuccess} />
            <p className="mt-3 text-[12px] text-slate-500 dark:text-slate-500">
              {waitlistCount != null
                ? <><b className="font-mono tabular-nums text-slate-700 dark:text-slate-300">{waitlistCount.toLocaleString()}</b> trader{waitlistCount === 1 ? "" : "s"} on the list — early access drops at 100. No spam.</>
                : <>No spam. Early access drops when we hit 100 signups.</>}
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <MockTracker />
          </div>
        </div>
      </section>

      {/* ── 3 FEATURE CARDS ─────────────────────────────────── */}
      <section className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-900 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">What's inside</div>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
              The three things you actually need
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600 dark:text-slate-400">
              Every firm has different rules. Every account has different risk. Every morning you run the same math. Let the app do it.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {/* Brand identity: single amber accent. All three feature cards
                use the same amber treatment — differentiation is by icon
                shape and copy, not color. */}
            <FeatureCard
              icon={BookOpen}
              title="Decoded rules"
              body="Every firm, every rule — consistency, trailing drawdown, payout cycles — translated into plain English with a worked example using the firm's real numbers."
              tone="amber"
            />
            <FeatureCard
              icon={Target}
              title="Daily trade plan"
              body="Every morning: how many contracts you can trade, what you're aiming for, what your max loss is. Calculated from your live balance, drawdown floor, and remaining target."
              tone="amber"
            />
            <FeatureCard
              icon={LineChart}
              title="Across all your accounts"
              body="Track every eval and funded account in one place. See real P&L across eval fees, activations, resets, and payouts — so you know if a firm actually paid back."
              tone="amber"
            />
          </div>
        </div>
      </section>

      {/* ── BUILT FOR ────────────────────────────────────────── */}
      <section className="border-t border-slate-100 dark:border-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Built for</div>
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight">Manual traders &amp; copy-trading stacks alike</h3>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-slate-600 dark:text-slate-400">
              <li className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />Manual trading</li>
              <li className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />Tradesyncer + NinjaTrader</li>
              <li className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />Tradovate / Rithmic</li>
              <li className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />5 firms · 20 plans</li>
            </ul>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-slate-500 dark:text-slate-500">
            <span className="font-medium text-slate-600 dark:text-slate-400">Firms tracked:</span>
            <span>FundedNext Futures</span>
            <span>Apex Trader Funding</span>
            <span>Tradeify</span>
            <span>Top One Futures</span>
            <span>Lucid Trading</span>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-900 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">How it works</div>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">From firm picker to daily plan in 5 minutes</h2>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-3">
            <StepCard n={1} title="Pick a firm" icon={BarChart3}>
              Ranked by an objective <b>Ease Score</b> — the geometric mean of how hard it is to pass and how hard it is to get paid. Filter by cost, rules, platform.
            </StepCard>
            <StepCard n={2} title="Track your account" icon={Briefcase}>
              Enter your starting balance, log daily P&amp;L (or import a CSV). Rules compliance tracks itself — consistency, drawdown, payout eligibility.
            </StepCard>
            <StepCard n={3} title="Follow the plan" icon={Target}>
              Every morning, open the app and get your <b>size</b>, <b>stop</b>, and <b>aim-for</b> per account. No more notebook math.
            </StepCard>
          </ol>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section ref={faqRef} className="border-t border-slate-100 dark:border-slate-900">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">FAQ</div>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">Quick answers</h2>
          </div>
          <div className="mt-10 rounded-none border border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900">
            <FaqItem q="Who is this for?">
              Futures prop-firm traders running one or more eval or funded accounts — especially if you juggle multiple firms or trade through a copier. If you've ever written "DD floor?" or "consistency adj?" in a notebook, you're the audience.
            </FaqItem>
            <FaqItem q="What does it actually do?">
              Three things: (1) ranks 20+ prop firms by objective ease scores so you pick the right one; (2) tracks your live accounts against each firm's rules; and (3) generates a daily trading plan — contracts, target, stop — so you don't do the math every morning.
            </FaqItem>
            <FaqItem q="When is it launching?">
              The core app already works — you can preview it. Early access for features like the plain-English rule translator and auto-journal rolls out as the waitlist grows. First 100 get founder pricing for life.
            </FaqItem>
            <FaqItem q="How much will it cost?">
              Pricing isn't final. Waitlist subscribers will get a locked-in discount for 12 months when we launch paid tiers. Core account tracking for a single firm will stay free.
            </FaqItem>
            <FaqItem q="Is my data safe?">
              Your account balances, journal, and payouts are yours — stored in a Supabase database with row-level security, visible only to you. We don't share, sell, or train models on your data.
            </FaqItem>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-900 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <div className="inline-flex items-center gap-1.5 rounded-none border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <TrendingUp size={11} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400" />
            Early access
          </div>
          <h2 className="mt-4 text-[28px] font-semibold tracking-tight sm:text-[34px]">
            Still guessing which firm to buy?
          </h2>
          <p className="mt-3 text-[14.5px] text-slate-600 dark:text-slate-400">
            Get the scoreboard, rules translator, and daily plan the moment early access drops.
          </p>
          <WaitlistForm size="lg" className="mx-auto mt-8 max-w-lg" onSuccess={handleSignupSuccess} />
          <p className="mt-3 text-[12px] text-slate-500 dark:text-slate-500">
            {waitlistCount != null
              ? <>Join <b className="font-mono tabular-nums text-slate-700 dark:text-slate-300">{waitlistCount.toLocaleString()}</b> trader{waitlistCount === 1 ? "" : "s"} already on the list. No spam.</>
              : <>No spam. Unsubscribe any time.</>}
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-[12px] text-slate-500 dark:text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span>© {new Date().getFullYear()} mindOS · Futures Prop Firm Analyzer</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/app" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">Preview app</a>
            <a href="mailto:alteodorescu84@gmail.com" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Small internal components ─────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, body, tone = "slate" }) {
  const toneBg = {
    amber:   "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    blue:    "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    slate:   "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  }[tone] || "bg-slate-100 text-slate-700";
  return (
    <div className="rounded-none border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-none ${toneBg}`}>
        <Icon size={17} strokeWidth={2.25} />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
    </div>
  );
}

function StepCard({ n, title, icon: Icon, children }) {
  return (
    <li className="rounded-none border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-none bg-amber-500 text-[12px] font-bold text-slate-950">{n}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-none bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <Icon size={14} strokeWidth={2.25} />
        </div>
      </div>
      <h3 className="mt-4 text-[16px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>
    </li>
  );
}
