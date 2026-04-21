// ═══════════════════════════════════════════════════════════
//  Shared UI Primitives
//  Modern SaaS dashboard design system — slate neutrals with
//  a single blue accent, semantic colors reserved strictly for
//  data meaning. All primitives are dark-mode aware via Tailwind
//  `dark:` classes.
// ═══════════════════════════════════════════════════════════

import { forwardRef, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";

// ── Utility ─────────────────────────────────────────────────
export const cx = (...args) => args.filter(Boolean).join(" ");

// ═══════════════════════════════════════════════════════════
// Button
// ═══════════════════════════════════════════════════════════

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
  "focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none " +
  "whitespace-nowrap select-none";

const BUTTON_VARIANTS = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 " +
    "dark:bg-blue-500 dark:hover:bg-blue-600 " +
    "shadow-sm",
  secondary:
    "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 " +
    "dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800 " +
    "dark:hover:bg-slate-800 dark:hover:border-slate-700 " +
    "shadow-sm",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 " +
    "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
  danger:
    "bg-red-600 text-white hover:bg-red-700 " +
    "dark:bg-red-500 dark:hover:bg-red-600 " +
    "shadow-sm",
  "ghost-danger":
    "bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 " +
    "dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300",
};

const BUTTON_SIZES = {
  xs: "h-7 px-2.5 text-xs rounded-md",
  sm: "h-8 px-3 text-[13px] rounded-md",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-10 px-5 text-sm rounded-lg",
  "icon-sm": "h-8 w-8 rounded-md",
  "icon-md": "h-9 w-9 rounded-lg",
};

export const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary,
        BUTTON_SIZES[size] || BUTTON_SIZES.md,
        className
      )}
      {...rest}
    >
      {loading && <Spinner size={size === "xs" ? 12 : 14} />}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

function Spinner({ size = 14 }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// Card
// ═══════════════════════════════════════════════════════════

// Card — flat surface by default. Shadows are reserved for floating overlays
// (modals, dropdowns, tooltips). Pass `elevated` to opt a surface back into
// soft-shadow styling. `hover` adds a subtle ring on hover for clickable rows.
export function Card({
  as: Tag = "section",
  className,
  children,
  hover = false,
  elevated = false,
  ...rest
}) {
  return (
    <Tag
      className={cx(
        "rounded-lg border border-slate-200 bg-white",
        "dark:border-slate-800 dark:bg-slate-900",
        elevated && "shadow-soft",
        hover && "transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-700",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...rest }) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3",
        "dark:border-slate-800",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }) {
  return (
    <h3
      className={cx(
        "text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100",
        className
      )}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...rest }) {
  return (
    <p className={cx("mt-0.5 text-[12px] text-slate-500 dark:text-slate-400", className)} {...rest}>
      {children}
    </p>
  );
}

export function CardBody({ className, children, ...rest }) {
  return (
    <div className={cx("px-4 py-3.5", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }) {
  return (
    <div
      className={cx(
        "flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2.5",
        "dark:border-slate-800",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Badge — for status, tags, counts
// ═══════════════════════════════════════════════════════════

const BADGE_VARIANTS = {
  neutral:
    "bg-slate-100 text-slate-700 border-slate-200 " +
    "dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  success:
    "bg-emerald-50 text-emerald-700 border-emerald-200 " +
    "dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  warn:
    "bg-amber-50 text-amber-800 border-amber-200 " +
    "dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  danger:
    "bg-red-50 text-red-700 border-red-200 " +
    "dark:bg-red-950/50 dark:text-red-300 dark:border-red-900",
  info:
    "bg-blue-50 text-blue-700 border-blue-200 " +
    "dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900",
  accent:
    "bg-blue-600 text-white border-blue-600 " +
    "dark:bg-blue-500 dark:border-blue-500",
};

const BADGE_SIZES = {
  sm: "h-5 px-1.5 text-[10.5px]",
  md: "h-6 px-2 text-[11.5px]",
};

export function Badge({
  variant = "neutral",
  size = "md",
  className,
  children,
  icon: Icon,
  dot = false,
  ...rest
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border font-medium tabular-nums",
        BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral,
        BADGE_SIZES[size] || BADGE_SIZES.md,
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            variant === "success" && "bg-emerald-500",
            variant === "warn" && "bg-amber-500",
            variant === "danger" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "neutral" && "bg-slate-400",
            variant === "accent" && "bg-white"
          )}
        />
      )}
      {Icon && <Icon size={11} strokeWidth={2.5} aria-hidden="true" />}
      {children}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// StatTile — KPI cell
// ═══════════════════════════════════════════════════════════

// Flat KPI tiles — label on top, value in large tabular numerics, optional sub.
// Tone now affects **only** the value color (semantic meaning stays) — no more
// tinted chip backgrounds behind the icon. This is the density-friendly default.
// Pass `icon` to prefix the label with a small monochrome icon.
const TILE_TONES = {
  slate:   { accent: "text-slate-900 dark:text-slate-100" },
  blue:    { accent: "text-blue-700 dark:text-blue-400" },
  emerald: { accent: "text-emerald-700 dark:text-emerald-400" },
  red:     { accent: "text-red-600 dark:text-red-400" },
  amber:   { accent: "text-amber-700 dark:text-amber-400" },
};

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "slate",
  size = "md",           // "sm" | "md" | "lg"
  className,
  ...rest
}) {
  const t = TILE_TONES[tone] || TILE_TONES.slate;
  const valueCls =
    size === "sm" ? "text-[17px]" :
    size === "lg" ? "text-[26px]" :
                    "text-[21px]";
  const pad = size === "sm" ? "px-3 py-2.5" : size === "lg" ? "px-4 py-4" : "px-4 py-3";
  return (
    <div className={cx(pad, className)} {...rest}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.25} aria-hidden="true" className="text-slate-400 dark:text-slate-500" />}
        <span>{label}</span>
      </div>
      <div className={cx("mt-0.5 font-semibold tabular-nums tracking-tight leading-tight", valueCls, t.accent)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PageHeader — consistent title/description/actions block.
// Use as the first child inside a tab panel. Supersedes ad-hoc
// `<div><h2><p></div>` patterns sprinkled through App.jsx.
// ═══════════════════════════════════════════════════════════

export function PageHeader({ title, description, actions, eyebrow, className }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KpiRow — responsive strip of StatTiles.
// Default layout: N cols on desktop, 3 on tablet, 2 on mobile.
// Dividers between tiles render automatically; override cols if needed.
// Usage:
//   <KpiRow>
//     <StatTile label="…" value="…" />
//     <StatTile label="…" value="…" />
//   </KpiRow>
// ═══════════════════════════════════════════════════════════

export function KpiRow({ children, cols, className, dividers = true, flat = false }) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : 1;
  const desktopCols = cols || Math.min(Math.max(count, 2), 6);
  // Tailwind JIT can't see dynamic class names, so enumerate.
  const lgClass = {
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  }[desktopCols] || "lg:grid-cols-4";
  const gridCls = cx("grid grid-cols-2 sm:grid-cols-3", lgClass);
  const wrapper = flat
    ? "overflow-hidden"
    : "overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  return (
    <div className={cx(wrapper, className)}>
      <div className={cx(gridCls, dividers && "divide-x divide-y divide-slate-100 dark:divide-slate-800")}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DataTable — responsive table that becomes a card-list below `md`.
// Columns: [{ key, header, render?, align?, className?, mono?, widthClass? }]
// Rows: array of objects. `rowKey` = prop name or function returning a key.
// If `mobileCard` is provided, it's used for the <md view instead of the auto
// stacked-row fallback; gives callers full control of mobile density.
// ═══════════════════════════════════════════════════════════

export function DataTable({
  columns,
  rows,
  rowKey = "id",
  onRowClick,
  selectedRowKey,
  empty,
  mobileCard,
  className,
  stickyHeader = true,
  striped = false,
  dense = false,
}) {
  if (!rows || rows.length === 0) return empty || null;
  const keyOf = typeof rowKey === "function" ? rowKey : (r, i) => (r[rowKey] ?? i);

  const thPad = dense ? "px-2.5 py-2" : "px-3 py-2.5";
  const tdPad = dense ? "px-2.5 py-2" : "px-3 py-2.5";

  // Desktop: proper table.
  const desktop = (
    <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className={cx(stickyHeader && "sticky top-0 z-10 bg-slate-50/80 backdrop-blur dark:bg-slate-900/80")}>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              {columns.map(c => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    thPad,
                    "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                    c.widthClass
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const k = keyOf(r, i);
              const selected = k === selectedRowKey;
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(r, i) : undefined}
                  className={cx(
                    "border-b border-slate-100 last:border-b-0 dark:border-slate-800/60",
                    onRowClick && "cursor-pointer transition-colors",
                    onRowClick && "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                    striped && i % 2 === 1 && "bg-slate-50/40 dark:bg-slate-900/40",
                    selected && "bg-blue-50/60 dark:bg-blue-950/30"
                  )}
                >
                  {columns.map(c => {
                    const val = c.render ? c.render(r, i) : r[c.key];
                    return (
                      <td
                        key={c.key}
                        className={cx(
                          tdPad,
                          "align-middle text-slate-900 dark:text-slate-100",
                          c.mono && "tabular-nums",
                          c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                          c.className
                        )}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Mobile: stacked-row fallback or caller's custom card.
  const mobile = (
    <div className="md:hidden space-y-2">
      {rows.map((r, i) => {
        const k = keyOf(r, i);
        if (mobileCard) return <div key={k}>{mobileCard(r, i)}</div>;
        return (
          <div
            key={k}
            onClick={onRowClick ? () => onRowClick(r, i) : undefined}
            className={cx(
              "rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900",
              onRowClick && "cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40"
            )}
          >
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[12.5px]">
              {columns.map(c => {
                const val = c.render ? c.render(r, i) : r[c.key];
                return (
                  <div key={c.key} className="contents">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 self-center">
                      {c.header}
                    </dt>
                    <dd className={cx("text-slate-900 dark:text-slate-100", c.mono && "tabular-nums", "text-right")}>
                      {val}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={className}>
      {desktop}
      {mobile}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal — portal-based dialog with focus trap & escape-to-close
// ═══════════════════════════════════════════════════════════

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md", // sm | md | lg | xl
  closeOnBackdrop = true,
  className,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);

    // Prevent body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first focusable element in the panel
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      el?.focus?.();
    }, 30);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size] || "max-w-lg";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className={cx(
          "relative w-full rounded-xl border border-slate-200 bg-white shadow-soft-lg",
          "dark:border-slate-800 dark:bg-slate-900",
          "animate-scale-in overflow-hidden",
          sizeClass,
          className
        )}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              {title && (
                <h2 id="modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════
// TextField & SelectField
// ═══════════════════════════════════════════════════════════

const INPUT_BASE =
  "block w-full rounded-md border bg-white text-slate-900 placeholder-slate-400 " +
  "border-slate-300 shadow-sm " +
  "transition-colors duration-150 " +
  "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 " +
  "dark:border-slate-700 dark:focus:border-blue-500";

const INPUT_SIZES = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3 text-sm",
  lg: "h-10 px-3.5 text-sm",
};

export const TextField = forwardRef(function TextField(
  { label, hint, error, id, size = "md", className, wrapperClassName, required, ...rest },
  ref
) {
  const autoId = id || `tf-${Math.random().toString(36).slice(2, 9)}`;
  const describedBy = error ? `${autoId}-err` : hint ? `${autoId}-hint` : undefined;
  return (
    <div className={cx("w-full", wrapperClassName)}>
      {label && (
        <label
          htmlFor={autoId}
          className="mb-1 block text-[12px] font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={autoId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={cx(
          INPUT_BASE,
          INPUT_SIZES[size] || INPUT_SIZES.md,
          error && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          className
        )}
        {...rest}
      />
      {error ? (
        <p id={`${autoId}-err`} role="alert" className="mt-1 flex items-center gap-1 text-[11.5px] text-red-600 dark:text-red-400">
          <AlertCircle size={11} strokeWidth={2.5} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${autoId}-hint`} className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export const SelectField = forwardRef(function SelectField(
  { label, hint, error, id, size = "md", className, wrapperClassName, required, children, ...rest },
  ref
) {
  const autoId = id || `sf-${Math.random().toString(36).slice(2, 9)}`;
  const describedBy = error ? `${autoId}-err` : hint ? `${autoId}-hint` : undefined;
  return (
    <div className={cx("w-full", wrapperClassName)}>
      {label && (
        <label
          htmlFor={autoId}
          className="mb-1 block text-[12px] font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={autoId}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={cx(
            INPUT_BASE,
            INPUT_SIZES[size] || INPUT_SIZES.md,
            "appearance-none pr-8",
            error && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
      {error ? (
        <p id={`${autoId}-err`} role="alert" className="mt-1 flex items-center gap-1 text-[11.5px] text-red-600 dark:text-red-400">
          <AlertCircle size={11} strokeWidth={2.5} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${autoId}-hint`} className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// Tabs — keyboard-navigable segmented control
// ═══════════════════════════════════════════════════════════

export function Tabs({ tabs, value, onChange, className, ariaLabel = "Tabs" }) {
  // tabs: [{ key, label, icon?: Component, badge?: ReactNode, disabled?: bool }]
  const listRef = useRef(null);

  const onKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.key === value);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      for (let i = 1; i <= tabs.length; i++) {
        const nxt = tabs[(idx + i) % tabs.length];
        if (!nxt.disabled) {
          onChange(nxt.key);
          break;
        }
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      for (let i = 1; i <= tabs.length; i++) {
        const nxt = tabs[(idx - i + tabs.length) % tabs.length];
        if (!nxt.disabled) {
          onChange(nxt.key);
          break;
        }
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = tabs.find((t) => !t.disabled);
      if (first) onChange(first.key);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = [...tabs].reverse().find((t) => !t.disabled);
      if (last) onChange(last.key);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      ref={listRef}
      onKeyDown={onKeyDown}
      className={cx(
        "flex flex-wrap items-center gap-0.5 border-b border-slate-200 dark:border-slate-800",
        className
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${t.key}`}
            id={`tab-${t.key}`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => !t.disabled && onChange(t.key)}
            className={cx(
              "group relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium",
              "transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              "dark:focus-visible:ring-offset-slate-950",
              t.disabled && "opacity-40 cursor-not-allowed",
              active
                ? "text-blue-700 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            )}
          >
            {Icon && <Icon size={14} strokeWidth={2.25} aria-hidden="true" />}
            <span>{t.label}</span>
            {t.badge != null && (
              <span
                className={cx(
                  "ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {t.badge}
              </span>
            )}
            {/* Active indicator */}
            <span
              aria-hidden="true"
              className={cx(
                "pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-t-full transition-opacity duration-150",
                active ? "bg-blue-600 dark:bg-blue-500 opacity-100" : "opacity-0"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EmptyState
// ═══════════════════════════════════════════════════════════

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/40 px-6 py-12 text-center",
        "dark:border-slate-800 dark:bg-slate-900/40",
        className
      )}
    >
      {Icon && (
        <div
          aria-hidden="true"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          <Icon size={18} strokeWidth={2} />
        </div>
      )}
      {title && (
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      )}
      {description && (
        <p className="mt-1 max-w-sm text-[12.5px] text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SectionHeader — titles above page sections
// ═══════════════════════════════════════════════════════════

export function SectionHeader({ title, description, actions, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Inline alert banner
// ═══════════════════════════════════════════════════════════

const ALERT_VARIANTS = {
  info: {
    Icon: Info,
    wrap: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-100",
    icon: "text-blue-600 dark:text-blue-400",
  },
  success: {
    Icon: CheckCircle2,
    wrap: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-100",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    Icon: AlertTriangle,
    wrap: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-100",
    icon: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    Icon: AlertCircle,
    wrap: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-100",
    icon: "text-red-600 dark:text-red-400",
  },
};

export function Alert({ variant = "info", title, children, className, ...rest }) {
  const v = ALERT_VARIANTS[variant] || ALERT_VARIANTS.info;
  const Icon = v.Icon;
  return (
    <div
      role="alert"
      className={cx("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px]", v.wrap, className)}
      {...rest}
    >
      <Icon size={16} strokeWidth={2.25} className={cx("mt-0.5 shrink-0", v.icon)} aria-hidden="true" />
      <div className="flex-1 leading-snug">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Divider
// ═══════════════════════════════════════════════════════════

export function Divider({ className, orientation = "horizontal" }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        orientation === "horizontal"
          ? "h-px w-full bg-slate-200 dark:bg-slate-800"
          : "w-px self-stretch bg-slate-200 dark:bg-slate-800",
        className
      )}
    />
  );
}

// ═══════════════════════════════════════════════════════════
// IconButton — compact icon-only
// ═══════════════════════════════════════════════════════════

export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, variant = "ghost", size = "icon-md", className, ...rest },
  ref
) {
  return (
    <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={className} {...rest}>
      <Icon size={size === "icon-sm" ? 14 : 16} strokeWidth={2.25} />
    </Button>
  );
});
