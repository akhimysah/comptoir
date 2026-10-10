import { Suspense } from "react";
import { activeCount, applyFilters, computeFacets, parseFilters } from "@/lib/filters";
import { FilterPanel } from "./FilterPanel";
import { ProductGrid } from "./ProductCard";
import type { CardProduct, StoreInfo } from "./types";

type SP = Record<string, string | string[] | undefined>;

export function sortProducts(list: CardProduct[], sort?: string) {
  const l = [...list];
  if (sort === "price-asc") l.sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "price-desc") l.sort((a, b) => b.priceCents - a.priceCents);
  if (sort === "name") l.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  return l;
}

export function ListingHeader({ title, description, count, sort, keep = {} }: { title: string; description?: string; count: number; sort?: string; keep?: SP }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-[60ch] text-[var(--c-muted)]">{description}</p>}
        <p className="mt-1 text-sm text-[var(--c-muted)]">{count} produit{count > 1 ? "s" : ""}</p>
      </div>
      <form className="flex items-center gap-2 text-sm">
        {/* Les filtres en cours sont conservés quand on change le tri. */}
        {Object.entries(keep).filter(([k]) => k !== "sort").flatMap(([k, v]) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map((x, i) => <input key={`${k}${i}`} type="hidden" name={k} value={x} />))}
        <label htmlFor="sort" className="text-[var(--c-muted)]">Trier</label>
        <select id="sort" name="sort" defaultValue={sort ?? "new"} className="rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_20%,transparent)] bg-[var(--c-surface)] px-3 py-2">
          <option value="new">Nouveautés</option>
          <option value="price-asc">Prix croissant</option>
          <option value="price-desc">Prix décroissant</option>
          <option value="name">Nom</option>
        </select>
        <button className="rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_20%,transparent)] px-3 py-2">OK</button>
      </form>
    </div>
  );
}

/** Grille de produits avec filtres (panneau à gauche sur ordinateur, repliable sur mobile). */
export function FilteredProducts({ products, collections = [], searchParams, store, empty }: { products: CardProduct[]; collections?: { handle: string; title: string }[]; searchParams: SP; store: StoreInfo & { rate?: number }; empty: React.ReactNode }) {
  const filters = parseFilters(searchParams);
  const rate = store.rate ?? 1;
  const list = sortProducts(applyFilters(products, filters, rate), typeof searchParams.sort === "string" ? searchParams.sort : undefined);
  const facets = computeFacets(products, collections, rate);
  const active = activeCount(filters);
  if (!products.length) return <>{empty}</>;
  const panel = <Suspense><FilterPanel facets={facets} filters={filters} currency={store.currency} active={active} /></Suspense>;
  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <aside className="hidden md:block" aria-label="Filtres">{panel}</aside>
      <div className="min-w-0">
        <details className="mb-5 rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_15%,transparent)] px-4 md:hidden">
          <summary className="cursor-pointer list-none py-3 text-sm font-semibold">Filtrer{active ? ` (${active})` : ""} · {list.length} produit{list.length > 1 ? "s" : ""}</summary>
          {panel}
        </details>
        {active > 0 && <p className="mb-4 hidden text-sm text-[var(--c-muted)] md:block">{list.length} produit{list.length > 1 ? "s" : ""} sur {products.length}</p>}
        {list.length ? <ProductGrid products={list} store={store} /> : <p className="text-[var(--c-muted)]">Aucun produit ne correspond à ces filtres. Retirez-en un pour élargir la recherche.</p>}
      </div>
    </div>
  );
}
