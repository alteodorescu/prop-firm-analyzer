// ═══════════════════════════════════════════════════════════
//  App shell — layout primitives for the redesigned frontend.
//
//  Responsibilities:
//   • NavRail     — desktop (≥lg) left sidebar, collapsible, remembers state
//   • BottomNav   — mobile (<lg) bottom dock, fixed position
//   • TopBar      — compact top bar with brand + global controls
//   • AppShell    — glues them together; wraps the routed content
//
//  Design notes:
//   • The desktop sidebar lives in a fixed, full-height column. Content pushes
//     right via `lg:pl-[var(--nav-w)]`. The CSS var lets us animate the width
//     between expanded (240px) and collapsed (64px) without re-rendering the
//     shell tree.
//   • The mobile bottom nav is fixed; content bottom-pads via `pb-20` on <lg.
//   • Everything here is dark-mode aware.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cx } from "./ui.jsx";

const COLLAPSED_W = 64;
const EXPANDED_W = 240;
const STORAGE_KEY = "ppfa.navCollapsed";

// ── BrandMark ───────────────────────────────────────────────────
// The mindOS wordmark, rendered in code (no SVG asset needed).
// Per brand-identity.md: lowercase `mind/os` with the slash in amber.
// `compact` collapses to just the amber slash for narrow rails / favicons.
// Sizes are tied to the rail / topbar 32px brand-mark slot.
export function BrandMark({ compact = false, size = "md", className }) {
  // Slot size: md = 32px tall (default sidebar/topbar), lg = bigger for hero
  const slot = size === "lg" ? "h-10 text-[28px]" : size === "sm" ? "h-7 text-[18px]" : "h-8 text-[22px]";

  if (compact) {
    return (
      <span
        aria-label="mindOS"
        className={cx(
          "inline-flex items-center justify-center font-black leading-none text-amber-500",
          slot,
          "w-[1em]", // square-ish slot proportional to font size
          className,
        )}
      >
        /
      </span>
    );
  }

  return (
    <span
      aria-label="mindOS"
      className={cx(
        "inline-flex items-baseline font-black leading-none tracking-tight text-slate-900 dark:text-slate-100",
        slot,
        className,
      )}
      style={{ letterSpacing: "-0.02em" }}
    >
      <span>mind</span>
      <span className="text-amber-500">/</span>
      <span>os</span>
    </span>
  );
}

// ── NavRail ─────────────────────────────────────────────────

export function NavRail({
  items,           // [{ key, label, shortLabel, icon, badge?, gated?, active }]
  activeKey,
  onSelect,
  brand,           // { icon: Component, title, subtitle? }
  footer,          // node — rendered at the bottom (theme toggle, user menu, etc.)
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* noop */ }
    document.documentElement.style.setProperty("--nav-w", `${collapsed ? COLLAPSED_W : EXPANDED_W}px`);
  }, [collapsed]);

  return (
    <aside
      aria-label="Primary navigation"
      className={cx(
        "fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col",
        "border-r border-slate-200 bg-white",
        "dark:border-slate-800 dark:bg-slate-950",
        "transition-[width] duration-200 ease-out",
      )}
      style={{ width: collapsed ? COLLAPSED_W : EXPANDED_W }}
    >
      {/* Brand — compact slash when collapsed, full wordmark expanded */}
      <div className={cx("flex h-14 items-center gap-2 border-b border-slate-200 dark:border-slate-800", collapsed ? "justify-center px-0" : "px-3.5")}>
        <BrandMark compact={collapsed} size="md" />
        {!collapsed && brand?.subtitle && (
          <div className="min-w-0">
            <div className="truncate text-[10.5px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {brand.subtitle}
            </div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {items.map(it => {
            const Icon = it.icon;
            const active = it.key === activeKey;
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => onSelect(it.key)}
                  title={collapsed ? it.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "group relative flex w-full items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors",
                    collapsed ? "h-9 justify-center px-0" : "h-9 px-2.5",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950",
                    active
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                  )}
                >
                  {Icon && <Icon size={16} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />}
                  {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{it.label}</span>}
                  {!collapsed && it.badge != null && (
                    <span className={cx(
                      "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                      active
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
                        : "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    )}>
                      {it.badge}
                    </span>
                  )}
                  {it.gated && !collapsed && (
                    <span aria-label="Requires sign-in" className="text-[10px] text-slate-400 dark:text-slate-600">●</span>
                  )}
                  {/* Active indicator on collapsed: left bar */}
                  {active && collapsed && (
                    <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-blue-600 dark:bg-blue-500" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: theme/lang/auth controls */}
      <div className={cx("border-t border-slate-200 dark:border-slate-800", collapsed ? "p-1.5" : "p-2.5")}>
        {footer && (
          <div className={cx(collapsed ? "flex flex-col items-center gap-1" : "flex flex-col gap-1")}>
            {footer({ collapsed })}
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cx(
            "mt-1.5 flex w-full items-center justify-center rounded-md py-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
          )}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}

// ── BottomNav ───────────────────────────────────────────────

export function BottomNav({ items, activeKey, onSelect, maxVisible = 5 }) {
  const visible = items.slice(0, maxVisible);
  const overflow = items.slice(maxVisible);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef(null);

  // Close sheet on outside click
  useEffect(() => {
    if (!sheetOpen) return;
    const onDown = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) setSheetOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [sheetOpen]);

  const hasOverflow = overflow.length > 0;
  const slots = hasOverflow ? visible.slice(0, maxVisible - 1) : visible;
  const moreActive = overflow.some(o => o.key === activeKey);

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${slots.length + (hasOverflow ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        {slots.map(it => {
          const Icon = it.icon;
          const active = it.key === activeKey;
          return (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => onSelect(it.key)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
                  active
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                {Icon && <Icon size={18} strokeWidth={2.25} aria-hidden="true" />}
                <span className="truncate max-w-full px-1">{it.shortLabel || it.label}</span>
                {it.badge != null && (
                  <span className="absolute top-1.5 right-[calc(50%-22px)] h-4 min-w-[16px] rounded-full bg-blue-600 px-1 text-[9.5px] font-semibold leading-4 text-white">
                    {it.badge}
                  </span>
                )}
                {active && (
                  <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-500" />
                )}
              </button>
            </li>
          );
        })}
        {hasOverflow && (
          <li>
            <button
              type="button"
              onClick={() => setSheetOpen(v => !v)}
              aria-expanded={sheetOpen}
              aria-label="More navigation"
              className={cx(
                "relative flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium",
                moreActive
                  ? "text-blue-700 dark:text-blue-400"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <MoreHorizontal size={18} strokeWidth={2.25} aria-hidden="true" />
              <span>More</span>
              {moreActive && (
                <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-500" />
              )}
            </button>
          </li>
        )}
      </ul>

      {/* Overflow sheet */}
      {sheetOpen && hasOverflow && (
        <div
          ref={sheetRef}
          role="menu"
          className="absolute bottom-full right-2 mb-2 min-w-[180px] rounded-lg border border-slate-200 bg-white shadow-soft-lg dark:border-slate-800 dark:bg-slate-900"
        >
          <ul className="py-1">
            {overflow.map(it => {
              const Icon = it.icon;
              const active = it.key === activeKey;
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setSheetOpen(false); onSelect(it.key); }}
                    className={cx(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]",
                      active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    )}
                  >
                    {Icon && <Icon size={14} strokeWidth={2.25} aria-hidden="true" />}
                    <span className="flex-1">{it.label}</span>
                    {it.badge != null && (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {it.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

// ── TopBar ──────────────────────────────────────────────────
// Compact top strip. On desktop it only shows page-level actions (the nav
// sidebar already handles brand + nav). On mobile it shows brand + actions.

export function TopBar({ brand, actions, children }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-5">
        {/* Mobile brand (desktop shows it in the sidebar) */}
        <div className="flex min-w-0 items-center gap-2 lg:hidden">
          <BrandMark size="md" />
          {brand?.subtitle && (
            <span className="hidden truncate text-[10.5px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:inline">
              {brand.subtitle}
            </span>
          )}
        </div>
        {/* Desktop: title/context (caller can provide) */}
        <div className="hidden min-w-0 lg:block">{children}</div>
        {/* Actions */}
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}

// ── AppShell ────────────────────────────────────────────────
// Composes NavRail + TopBar + BottomNav with the routed content.
// The content slot is scrolled; the rail and bottom nav are fixed.

export function AppShell({ navItems, activeKey, onSelect, brand, railFooter, topBarActions, topBarContent, children }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavRail
        items={navItems}
        activeKey={activeKey}
        onSelect={onSelect}
        brand={brand}
        footer={railFooter}
      />

      <div className="lg:pl-[var(--nav-w,240px)] transition-[padding] duration-200 ease-out">
        <TopBar brand={brand} actions={topBarActions}>
          {topBarContent}
        </TopBar>
        <main className="pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      <BottomNav items={navItems} activeKey={activeKey} onSelect={onSelect} />
    </div>
  );
}
