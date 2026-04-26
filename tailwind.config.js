/** @type {import('tailwindcss').Config} */
//
// mindOS brand tokens (per /Marketing/.../brand-assets/brand-identity.md):
//   navy        #0B1220   dark page bg
//   bone        #F5F2EB   light page bg (rare)
//   amber       #F5A623   single 1-element accent
//   soft-white  #E8E6E1   text on dark
//   slate       #64748B   muted text + borders (already = Tailwind slate-500)
//
// Strategy: override Tailwind's slate-50, slate-100, slate-950 with the brand
// equivalents so the existing 1000+ slate-* class usages auto-pick up the
// rebrand. Then expose explicit tokens (brand.amber, brand.navy, etc.) for
// new code that needs to reference the palette by name. Also override
// amber-500 to the exact brand hex.
//
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand-first explicit tokens. Use these for new code.
        brand: {
          navy:       "#0B1220",
          bone:       "#F5F2EB",
          amber:      "#F5A623",
          softwhite:  "#E8E6E1",
          slate:      "#64748B",
        },
        // Override the slate scale at the extremes so the existing app
        // (which is heavily slate-based) inherits the brand palette without
        // a 1000-class find/replace.
        slate: {
          50:  "#F5F2EB",   // bone
          100: "#E8E6E1",   // soft-white
          // 200..900 fall through to Tailwind defaults
          950: "#0B1220",   // navy
        },
        // Override amber-500 to the exact brand hex. Keep the rest of the
        // amber scale (400, 600 etc.) for hover/active variants.
        amber: {
          500: "#F5A623",
        },
      },
      fontFamily: {
        // Inter for everything; weight 900 = "Display Black" used by the
        // wordmark and hero numerals per brand identity.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
        // IBM Plex Mono — terminal-aesthetic numbers per brand identity.
        // Was JetBrains Mono. Use `font-mono` on every numeric / code block.
        mono: [
          "'IBM Plex Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "'Liberation Mono'",
          "'Courier New'",
          "monospace",
        ],
      },
      fontSize: {
        // Slightly tighter line-height for UI numerics
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        // Brand identity says "no drop shadows" — these stay defined for
        // overlays only (modals, dropdowns). New surface code should not
        // add shadows; use border-only treatment.
        "soft": "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "soft-md": "0 2px 4px -1px rgb(15 23 42 / 0.06), 0 4px 10px -2px rgb(15 23 42 / 0.08)",
        "soft-lg": "0 4px 6px -2px rgb(15 23 42 / 0.05), 0 10px 20px -5px rgb(15 23 42 / 0.1)",
      },
      ringColor: {
        // Brand amber as the focus ring (was blue). Keeps the brand-amber
        // accent visible on every focusable element.
        DEFAULT: "rgb(245 166 35 / 0.55)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
}
