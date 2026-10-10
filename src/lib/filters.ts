import type { CardProduct } from "@/components/store/types";

/**
 * Filtres de la boutique, lus dans l'adresse : ?dispo=1&promo=1&min=10&max=50&o=Taille:M&o=Couleur:Bleu&c=bols&note=4
 * Deux valeurs d'une même option se cumulent (« S ou M ») ; des options différentes se combinent (« M et Bleu »).
 */
export type Filters = { inStock: boolean; onSale: boolean; min: number | null; max: number | null; options: Record<string, string[]>; collections: string[]; rating: number | null };

export type Facets = {
  options: { key: string; name: string; values: { value: string; count: number }[] }[];
  collections: { handle: string; title: string; count: number }[];
  inStock: number;
  onSale: number;
  rated: number;
  priceMax: number; // en unités de la devise affichée, arrondi au supérieur
};

const optKey = (name: string) => name.trim().toLowerCase();
const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const num = (v: string | string[] | undefined) => {
  const n = Number(String(list(v)[0] ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && String(list(v)[0] ?? "") !== "" ? n : null;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const options: Record<string, string[]> = {};
  for (const raw of list(sp.o).slice(0, 30)) {
    const i = raw.indexOf(":");
    if (i <= 0) continue;
    const k = optKey(raw.slice(0, i));
    (options[k] ??= []).push(raw.slice(i + 1).trim());
  }
  const rating = num(sp.note);
  return { inStock: sp.dispo === "1", onSale: sp.promo === "1", min: num(sp.min), max: num(sp.max), options, collections: list(sp.c).slice(0, 20), rating: rating && rating >= 1 && rating <= 5 ? rating : null };
}

export const activeCount = (f: Filters) =>
  Number(f.inStock) + Number(f.onSale) + Number(f.min !== null) + Number(f.max !== null) + Object.values(f.options).reduce((s, v) => s + v.length, 0) + f.collections.length + Number(f.rating !== null);

const onSale = (p: CardProduct) => p.compareAtCents !== null && p.compareAtCents > p.priceCents;

/** Applique les filtres. Le prix est comparé dans la devise affichée (rate = taux de conversion). */
export function applyFilters(products: CardProduct[], f: Filters, rate = 1) {
  return products.filter((p) => {
    if (f.inStock && p.soldOut) return false;
    if (f.onSale && !onSale(p)) return false;
    const price = (p.priceCents * rate) / 100;
    if (f.min !== null && (p.maxPriceCents * rate) / 100 < f.min) return false;
    if (f.max !== null && price > f.max) return false;
    if (f.rating !== null && (!p.rating || p.rating.avg < f.rating)) return false;
    if (f.collections.length && !f.collections.some((c) => p.collectionHandles.includes(c))) return false;
    for (const [k, wanted] of Object.entries(f.options)) {
      const o = p.options.find((x) => optKey(x.name) === k);
      if (!o || !wanted.some((w) => o.values.some((v) => v.toLowerCase() === w.toLowerCase()))) return false;
    }
    return true;
  });
}

/** Valeurs proposées dans le panneau, avec le nombre de produits correspondants dans la liste. */
export function computeFacets(products: CardProduct[], collections: { handle: string; title: string }[], rate = 1): Facets {
  const opts = new Map<string, { name: string; values: Map<string, { value: string; count: number }> }>();
  for (const p of products) for (const o of p.options) {
    const k = optKey(o.name);
    const entry = opts.get(k) ?? { name: o.name, values: new Map() };
    for (const v of o.values) {
      const vk = v.toLowerCase();
      const cur = entry.values.get(vk) ?? { value: v, count: 0 };
      cur.count++;
      entry.values.set(vk, cur);
    }
    opts.set(k, entry);
  }
  return {
    options: [...opts.entries()].map(([key, o]) => ({ key, name: o.name, values: [...o.values.values()] })).filter((o) => o.values.length > 1 || products.length > 1),
    collections: collections.map((c) => ({ ...c, count: products.filter((p) => p.collectionHandles.includes(c.handle)).length })).filter((c) => c.count > 0),
    inStock: products.filter((p) => !p.soldOut).length,
    onSale: products.filter(onSale).length,
    rated: products.filter((p) => p.rating && p.rating.avg >= 4).length,
    priceMax: Math.ceil(Math.max(0, ...products.map((p) => (p.maxPriceCents * rate) / 100))),
  };
}
