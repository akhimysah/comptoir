import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15201B",
        pine: { DEFAULT: "#1F6F5C", dark: "#16594A", soft: "#D5E9E1" },
        side: "#13221C",
        canvas: "#EEF2EF",
        line: "#D3DCD6",
        muted: "#5A6A62",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
