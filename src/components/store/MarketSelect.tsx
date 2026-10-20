"use client";

/** Sélecteur de pays / marché dans l'en-tête de la boutique (comme le sélecteur de pays de Shopify). */
export function MarketSelect({ slug, markets, current, defaultLabel, label }: { slug: string; markets: { id: string; name: string }[]; current: string | null; defaultLabel: string; label: string }) {
  return (
    <select aria-label={label} defaultValue={current ?? "default"} onChange={(e) => { window.location.href = `/s/${slug}/market?m=${e.target.value}`; }} className="rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_20%,transparent)] bg-transparent px-2 py-1 text-sm">
      <option value="default">{defaultLabel}</option>
      {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}
