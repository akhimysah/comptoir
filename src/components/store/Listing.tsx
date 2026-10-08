import type { CardProduct } from "./types";

export function sortProducts(list: CardProduct[], sort?: string) {
  const l = [...list];
  if (sort === "price-asc") l.sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "price-desc") l.sort((a, b) => b.priceCents - a.priceCents);
  if (sort === "name") l.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  return l;
}

export function ListingHeader({ title, description, count, sort }: { title: string; description?: string; count: number; sort?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-[60ch] text-[var(--c-muted)]">{description}</p>}
        <p className="mt-1 text-sm text-[var(--c-muted)]">{count} produit{count > 1 ? "s" : ""}</p>
      </div>
      <form className="flex items-center gap-2 text-sm">
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
