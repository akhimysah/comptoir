export function Stars({ value, size = "text-base" }: { value: number; size?: string }) {
  return (
    <span className={`inline-flex ${size} leading-none`} aria-label={`${value.toFixed(1).replace(".", ",")} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className="relative text-[color-mix(in_srgb,var(--c-text)_20%,transparent)]">
          ★
          <span className="absolute inset-0 overflow-hidden text-[#e3a008]" style={{ width: `${Math.max(0, Math.min(1, value - i + 1)) * 100}%` }}>★</span>
        </span>
      ))}
    </span>
  );
}
