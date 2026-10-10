"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { Facets, Filters } from "@/lib/filters";

const box = "h-4 w-4 shrink-0 accent-[var(--c-accent)]";
const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-text)]";

/** Panneau de filtres : chaque changement met à jour l'adresse (partageable) sans recharger la page. */
export function FilterPanel({ facets, filters, currency, active }: { facets: Facets; filters: Filters; currency: string; active: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [min, setMin] = useState(filters.min?.toString() ?? "");
  const [max, setMax] = useState(filters.max?.toString() ?? "");

  const go = (edit: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params.toString());
    edit(p);
    const qs = p.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  };
  const flag = (k: string, on: boolean) => go((p) => (on ? p.set(k, "1") : p.delete(k)));
  const toggle = (k: string, v: string) => go((p) => {
    const cur = p.getAll(k);
    p.delete(k);
    (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).forEach((x) => p.append(k, x));
  });
  const price = () => go((p) => {
    for (const [k, v] of [["min", min], ["max", max]] as const) {
      const n = Number(v.replace(",", "."));
      if (v.trim() && Number.isFinite(n) && n >= 0) p.set(k, String(n)); else p.delete(k);
    }
  });
  const clear = () => { setMin(""); setMax(""); go((p) => ["dispo", "promo", "min", "max", "o", "c", "note"].forEach((k) => p.delete(k))); };
  // Ajoute ou retire « Option:valeur » (comparaison sans tenir compte des majuscules).
  const toggleOpt = (key: string, name: string, value: string) => go((p) => {
    const all = p.getAll("o");
    const match = (x: string) => x.slice(0, x.indexOf(":")).trim().toLowerCase() === key && x.slice(x.indexOf(":") + 1).trim().toLowerCase() === value.toLowerCase();
    p.delete("o");
    (all.some(match) ? all.filter((x) => !match(x)) : [...all, `${name}:${value}`]).forEach((x) => p.append("o", x));
  });
  const optChecked = (key: string, value: string) => (filters.options[key] ?? []).some((v) => v.toLowerCase() === value.toLowerCase());
  const symbol = currency === "EUR" ? "€" : currency;

  // Filtres actifs, affichés en pastilles à retirer d'un clic.
  const chips: { label: string; remove: () => void }[] = [
    ...(filters.inStock ? [{ label: "En stock", remove: () => flag("dispo", false) }] : []),
    ...(filters.onSale ? [{ label: "En promotion", remove: () => flag("promo", false) }] : []),
    ...(filters.min !== null || filters.max !== null ? [{ label: `${filters.min ?? 0} – ${filters.max ?? "∞"} ${symbol}`, remove: () => { setMin(""); setMax(""); go((p) => { p.delete("min"); p.delete("max"); }); } }] : []),
    ...(filters.rating !== null ? [{ label: `${filters.rating} ★ et plus`, remove: () => go((p) => p.delete("note")) }] : []),
    ...filters.collections.map((c) => ({ label: facets.collections.find((x) => x.handle === c)?.title ?? c, remove: () => toggle("c", c) })),
    ...Object.entries(filters.options).flatMap(([k, vals]) => vals.map((v) => {
      const name = facets.options.find((o) => o.key === k)?.name ?? k;
      return { label: `${name} : ${v}`, remove: () => toggleOpt(k, name, v) };
    })),
  ];

  const group = (title: string, children: React.ReactNode, open = true) => (
    <details key={title} open={open} className="group border-b border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        {title}
        <svg viewBox="0 0 12 12" className="h-3 w-3 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="m3 4.5 3 3 3-3" /></svg>
      </summary>
      <div className="mt-2.5 flex flex-col gap-2 text-sm">{children}</div>
    </details>
  );
  const check = (label: string, count: number, checked: boolean, onChange: () => void) => (
    <label className={`flex items-center gap-2 ${count === 0 && !checked ? "opacity-40" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={count === 0 && !checked} className={box} />
      <span className="flex-1">{label}</span>
      <span className="text-xs tabular-nums text-[var(--c-muted)]">{count}</span>
    </label>
  );

  return (
    <div className={pending ? "opacity-70 transition" : "transition"} aria-busy={pending}>
      {chips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <button key={i} type="button" onClick={c.remove} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] px-2.5 py-1 text-xs hover:border-[var(--c-text)]" aria-label={`Retirer le filtre ${c.label}`}>
              {c.label} <span aria-hidden>✕</span>
            </button>
          ))}
          {active > 1 && <button type="button" onClick={clear} className="px-1 text-xs underline underline-offset-2">Tout effacer</button>}
        </div>
      )}
      {group("Disponibilité", <>{check("En stock", facets.inStock, filters.inStock, () => flag("dispo", !filters.inStock))}</>)}
      {group("Prix", (
        <form onSubmit={(e) => { e.preventDefault(); price(); }} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="f-min">Prix minimum</label>
          <input id="f-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} onBlur={price} placeholder="0" className={field} />
          <span className="text-[var(--c-muted)]">à</span>
          <label className="sr-only" htmlFor="f-max">Prix maximum</label>
          <input id="f-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} onBlur={price} placeholder={String(facets.priceMax)} className={field} />
          <span className="text-[var(--c-muted)]">{symbol}</span>
        </form>
      ))}
      {facets.onSale > 0 && group("Promotions", <>{check("En promotion", facets.onSale, filters.onSale, () => flag("promo", !filters.onSale))}</>)}
      {facets.collections.length > 1 && group("Catégorie", <>{facets.collections.map((c) => <div key={c.handle}>{check(c.title, c.count, filters.collections.includes(c.handle), () => toggle("c", c.handle))}</div>)}</>)}
      {facets.options.map((o) => group(o.name, (
        <>{o.values.map((v) => <div key={v.value}>{check(v.value, v.count, optChecked(o.key, v.value), () => toggleOpt(o.key, o.name, v.value))}</div>)}</>
      ), o.values.length <= 8))}
      {facets.rated > 0 && group("Avis clients", <>{check("4 ★ et plus", facets.rated, filters.rating === 4, () => go((p) => (filters.rating === 4 ? p.delete("note") : p.set("note", "4"))))}</>)}
    </div>
  );
}
