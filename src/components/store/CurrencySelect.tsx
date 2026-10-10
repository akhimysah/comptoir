"use client";

import { dict } from "@/lib/i18n";
import { useLocale } from "./locale";

const T = dict({ currency: "Devise" }, { currency: "Currency" });

export function CurrencySelect({ slug, codes, current }: { slug: string; codes: string[]; current: string }) {
  const t = T[useLocale()];
  return (
    <select
      aria-label={t.currency}
      defaultValue={current}
      onChange={(e) => { window.location.href = `/s/${slug}/currency?c=${e.target.value}`; }}
      className="rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_20%,transparent)] bg-transparent px-2 py-1 text-sm"
    >
      {codes.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}
