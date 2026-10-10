import { dict, type Locale } from "@/lib/i18n";

const T = dict(
  { label: (v: number) => `${v.toFixed(1).replace(".", ",")} sur 5` },
  { label: (v: number) => `${v.toFixed(1)} out of 5` },
);

export function Stars({ value, size = "text-base", locale = "fr" }: { value: number; size?: string; locale?: Locale }) {
  return (
    <span className={`inline-flex ${size} leading-none`} aria-label={T[locale].label(value)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className="relative text-[color-mix(in_srgb,var(--c-text)_20%,transparent)]">
          ★
          <span className="absolute inset-0 overflow-hidden text-[#e3a008]" style={{ width: `${Math.max(0, Math.min(1, value - i + 1)) * 100}%` }}>★</span>
        </span>
      ))}
    </span>
  );
}
