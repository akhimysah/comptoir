import type { Config } from "tailwindcss";

// Palette inspirée de l'admin Shopify (Polaris).
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#303030",
        pine: { DEFAULT: "#6d28d9", dark: "#5b21b6", soft: "#ede9fe" }, // liens et accents (violet Parnassa Pay)
        side: "#ebebeb",
        canvas: "#f1f1f1",
        line: "#e3e3e3",
        muted: "#616161",
        topbar: "#1a1a1a",
      },
      fontFamily: {
        display: ["var(--font-body)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(26,26,26,.07), inset 0 1px 0 0 rgba(204,204,204,.5), inset 0 -1px 0 0 rgba(0,0,0,.17), inset -1px 0 0 0 rgba(0,0,0,.13), inset 1px 0 0 0 rgba(0,0,0,.13)",
        btn: "0 -1px 0 0 #b5b5b5 inset, 0 0 0 1px rgba(0,0,0,.1) inset, 0 .5px 0 1.5px #fff inset",
        "btn-primary": "0 -1px 0 1px rgba(46,16,101,.6) inset, 0 0 0 1px #5b21b6 inset, 0 .5px 0 1.5px rgba(255,255,255,.25) inset",
      },
    },
  },
  plugins: [],
} satisfies Config;
