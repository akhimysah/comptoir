import { describe, expect, it } from "vitest";
import { applyFilters } from "@/lib/liquid/collection-filters";
import { samplePageData } from "./sample-data";

/** Filtres, tri et adresses au format Shopify (collection.filters). */
describe("filtres de collection", () => {
  const all = samplePageData().collections[0].products;
  it("construit les filtres avec comptes et adresses, et cumule les critères", () => {
    const { products, filters, sort_by } = applyFilters(all, new URLSearchParams("sort_by=price-descending"), "/s/demo/collections/all", "fr");
    expect(sort_by).toBe("price-descending");
    expect(products.map((p) => p.price)).toEqual([...products.map((p) => p.price)].sort((a, b) => b - a));
    const availability = filters.find((f) => f.param_name === "filter.v.availability")!;
    expect(availability.values[0].url_to_add).toBe("/s/demo/collections/all?sort_by=price-descending&filter.v.availability=1");
    expect(filters.some((f) => f.type === "price_range")).toBe(true);
    const price = filters.find((f) => f.type === "price_range")!;
    expect(price.range_max).toBe(Math.max(...all.map((p) => p.price)));
  });
  it("filtre par disponibilité et par prix, en gardant les comptes des autres valeurs", () => {
    const max = Math.max(...all.map((p) => p.price));
    const { products, filters } = applyFilters(all, new URLSearchParams(`filter.v.availability=1&filter.v.price.lte=${max / 100 - 0.01}`), "/c", "en");
    expect(products.every((p) => p.available && p.price < max)).toBe(true);
    const availability = filters.find((f) => f.param_name === "filter.v.availability")!;
    expect(availability.active_values.map((v) => v.value)).toEqual(["1"]);
    expect(availability.values[0].url_to_remove).not.toContain("availability");
    expect(availability.values[0].url_to_remove).toContain("filter.v.price.lte");
  });
});
