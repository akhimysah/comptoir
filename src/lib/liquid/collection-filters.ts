import type { ShopifyFilter, ShopifyProduct } from "./types";

/**
 * Filtres et tri des collections et de la recherche, au format Shopify (collection.filters, ?filter.v.price.gte=…,
 * ?sort_by=…). Les thèmes affichent ces filtres (cases à cocher, curseur de prix) et construisent les adresses eux-mêmes
 * à partir de url_to_add / url_to_remove.
 */
type FilterValue = ShopifyFilter["values"][number];

const SORTS: Record<string, (a: ShopifyProduct, b: ShopifyProduct) => number> = {
  "price-ascending": (a, b) => a.price - b.price,
  "price-descending": (a, b) => b.price - a.price,
  "title-ascending": (a, b) => a.title.localeCompare(b.title),
  "title-descending": (a, b) => b.title.localeCompare(a.title),
  "created-ascending": (a, b) => a.created_at.localeCompare(b.created_at),
  "created-descending": (a, b) => b.created_at.localeCompare(a.created_at),
};
export const SORT_OPTIONS = (locale: string) => locale === "en"
  ? [{ name: "Featured", value: "manual" }, { name: "Best selling", value: "best-selling" }, { name: "Alphabetically, A-Z", value: "title-ascending" }, { name: "Alphabetically, Z-A", value: "title-descending" }, { name: "Price, low to high", value: "price-ascending" }, { name: "Price, high to low", value: "price-descending" }, { name: "Date, old to new", value: "created-ascending" }, { name: "Date, new to old", value: "created-descending" }]
  : [{ name: "En vedette", value: "manual" }, { name: "Meilleures ventes", value: "best-selling" }, { name: "Alphabétique, de A à Z", value: "title-ascending" }, { name: "Alphabétique, de Z à A", value: "title-descending" }, { name: "Prix : faible à élevé", value: "price-ascending" }, { name: "Prix : élevé à faible", value: "price-descending" }, { name: "Date, de la plus ancienne à la plus récente", value: "created-ascending" }, { name: "Date, de la plus récente à la plus ancienne", value: "created-descending" }];

/** Adresse de la page avec un jeu de paramètres (page remise à 1). */
const href = (path: string, params: URLSearchParams) => { const p = new URLSearchParams(params); p.delete("page"); const q = p.toString(); return q ? `${path}?${q}` : path; };
const withParam = (path: string, params: URLSearchParams, key: string, value: string) => { const p = new URLSearchParams(params); if (![...p.getAll(key)].includes(value)) p.append(key, value); return href(path, p); };
const withoutParam = (path: string, params: URLSearchParams, key: string, value?: string) => { const p = new URLSearchParams(params); const keep = value === undefined ? [] : p.getAll(key).filter((v) => v !== value); p.delete(key); for (const v of keep) p.append(key, v); return href(path, p); };

export function applyFilters(all: ShopifyProduct[], params: URLSearchParams, path: string, locale = "fr", defaultSort = "manual"): { products: ShopifyProduct[]; filters: ShopifyFilter[]; sort_by: string } {
  const t = (fr: string, en: string) => (locale === "en" ? en : fr);
  // Critères actifs.
  const active = {
    availability: params.getAll("filter.v.availability"),
    vendor: params.getAll("filter.p.vendor"),
    type: params.getAll("filter.p.product_type"),
    tag: params.getAll("filter.p.tag"),
    gte: params.get("filter.v.price.gte"), lte: params.get("filter.v.price.lte"),
    options: new Map<string, string[]>(),
  };
  for (const [k, v] of params) if (k.startsWith("filter.v.option.")) { const name = k.slice(16); active.options.set(name, [...(active.options.get(name) ?? []), v]); }
  const optionNames = [...new Set(all.flatMap((p) => p.options.filter((o) => o !== "Title")))];

  // Un produit passe un critère si l'une des valeurs choisies lui correspond (les critères se cumulent entre eux).
  const passes = (p: ShopifyProduct, skip?: string) => {
    if (skip !== "availability" && active.availability.length && !active.availability.includes(p.available ? "1" : "0")) return false;
    if (skip !== "vendor" && active.vendor.length && !active.vendor.includes(p.vendor)) return false;
    if (skip !== "type" && active.type.length && !active.type.includes(p.type)) return false;
    if (skip !== "tag" && active.tag.length && !active.tag.some((x) => p.tags.includes(x))) return false;
    if (skip !== "price") { if (active.gte && p.price < Math.round(Number(active.gte) * 100)) return false; if (active.lte && p.price > Math.round(Number(active.lte) * 100)) return false; }
    for (const [name, values] of active.options) { if (skip === `option:${name}`) continue; const o = p.options_with_values.find((x) => x.name === name); if (!o || !values.some((v) => o.values.includes(v))) return false; }
    return true;
  };
  const list = (label: string, param: string, kind: string, values: { value: string; label?: string; count: number }[], chosen: string[]): ShopifyFilter | null => {
    if (!values.length) return null;
    const vals: FilterValue[] = values.map((v) => ({ label: v.label ?? v.value, value: v.value, count: v.count, active: chosen.includes(v.value), param_name: param, url_to_add: withParam(path, params, param, v.value), url_to_remove: withoutParam(path, params, param, v.value) }));
    return { label, param_name: param, type: "list", values: vals, active_values: vals.filter((v) => v.active), url_to_remove: withoutParam(path, params, param), operator: kind === "tag" ? "OR" : "OR", presentation: "text" };
  };
  const count = (skip: string, pred: (p: ShopifyProduct) => boolean) => all.filter((p) => passes(p, skip) && pred(p)).length;
  const filters: ShopifyFilter[] = [];
  const availability = list(t("Disponibilité", "Availability"), "filter.v.availability", "availability", [{ value: "1", label: t("En stock", "In stock"), count: count("availability", (p) => p.available) }, { value: "0", label: t("En rupture", "Out of stock"), count: count("availability", (p) => !p.available) }].filter((v) => v.count || active.availability.includes(v.value)), active.availability);
  if (availability) filters.push(availability);
  const prices = all.map((p) => p.price);
  if (prices.length) {
    const max = Math.max(...prices);
    // Comme sur Shopify : valeurs en centimes dans l'objet, en unités dans l'adresse ; pas de liste `values` (nil) pour un intervalle.
    const price: ShopifyFilter = { label: t("Prix", "Price"), param_name: "filter.v.price", type: "price_range", values: undefined as unknown as FilterValue[], active_values: [], min_value: { param_name: "filter.v.price.gte", value: active.gte ? Math.round(Number(active.gte) * 100) : null }, max_value: { param_name: "filter.v.price.lte", value: active.lte ? Math.round(Number(active.lte) * 100) : null }, range_max: max, url_to_remove: href(path, new URLSearchParams([...params].filter(([k]) => !k.startsWith("filter.v.price")))) };
    filters.push(price);
  }
  for (const name of optionNames) {
    const values = [...new Set(all.flatMap((p) => p.options_with_values.find((o) => o.name === name)?.values ?? []))];
    const f = list(name, `filter.v.option.${name}`, "option", values.map((v) => ({ value: v, count: count(`option:${name}`, (p) => (p.options_with_values.find((o) => o.name === name)?.values ?? []).includes(v)) })), active.options.get(name) ?? []);
    if (f) filters.push(f);
  }
  const vendors = [...new Set(all.map((p) => p.vendor).filter(Boolean))].sort();
  const fv = list(t("Marque", "Brand"), "filter.p.vendor", "vendor", vendors.map((v) => ({ value: v, count: count("vendor", (p) => p.vendor === v) })), active.vendor);
  if (fv && vendors.length > 1) filters.push(fv);
  const types = [...new Set(all.map((p) => p.type).filter(Boolean))].sort();
  const ft = list(t("Type de produit", "Product type"), "filter.p.product_type", "type", types.map((v) => ({ value: v, count: count("type", (p) => p.type === v) })), active.type);
  if (ft && types.length > 1) filters.push(ft);
  const tags = [...new Set(all.flatMap((p) => p.tags))].sort();
  const fg = list(t("Étiquettes", "Tags"), "filter.p.tag", "tag", tags.map((v) => ({ value: v, count: count("tag", (p) => p.tags.includes(v)) })), active.tag);
  if (fg && tags.length > 1) filters.push(fg);

  const sort_by = params.get("sort_by") ?? defaultSort;
  const products = all.filter((p) => passes(p));
  if (SORTS[sort_by]) products.sort(SORTS[sort_by]);
  return { products, filters, sort_by };
}
