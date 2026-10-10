"use client";

import { LOCALES, type Locale } from "@/lib/i18n";

export function LanguageSelect({ slug, locales, current }: { slug: string; locales: Locale[]; current: Locale }) {
  return (
    <select
      aria-label={current === "en" ? "Language" : "Langue"}
      defaultValue={current}
      onChange={(e) => { window.location.href = `/s/${slug}/lang?l=${e.target.value}`; }}
      className="rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_20%,transparent)] bg-transparent px-2 py-1 text-sm"
    >
      {locales.map((l) => <option key={l} value={l}>{l.toUpperCase()} · {LOCALES[l]}</option>)}
    </select>
  );
}
