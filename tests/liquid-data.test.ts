import { describe, expect, it } from "vitest";
import { shopifyProduct, moneyFormat } from "@/lib/liquid/data";
import { lineKey, readCartCookie } from "@/lib/liquid/cart";
import { themePath, looksLikeShopifyTheme } from "@/lib/liquid/source";

/** Pont entre nos données et les objets Shopify attendus par les thèmes Liquid. */
describe("import d'un thème Shopify", () => {
  it("n'accepte que les dossiers d'un thème, sans remontée ni fichier caché", () => {
    expect(themePath("Prestige/sections/header.liquid")).toBe("sections/header.liquid");
    expect(themePath("assets/base.css")).toBe("assets/base.css");
    expect(themePath("templates/customers/login.json")).toBe("templates/customers/login.json");
    expect(themePath("../etc/passwd")).toBeNull();
    expect(themePath("sections/../layout/theme.liquid")).toBeNull();
    expect(themePath("__MACOSX/sections/._header.liquid")).toBeNull();
    expect(themePath("README.md")).toBeNull();
    expect(themePath("assets/virus.exe")).toBeNull();
    expect(looksLikeShopifyTheme(["x/layout/theme.liquid", "x/config/settings_schema.json"])).toBe(true);
    expect(looksLikeShopifyTheme(["theme.json"])).toBe(false);
  });
});

describe("panier serveur des thèmes Shopify", () => {
  it("lit le cookie, ignore les lignes invalides et distingue les propriétés", () => {
    const cookie = `other=1; lc_s1=${encodeURIComponent(JSON.stringify([{ v: "v1", q: 2 }, { v: "v2", q: 0 }, { q: 1 }, { v: "v1", q: 1, p: { Gravure: "Léa" } }]))}`;
    const lines = readCartCookie(cookie, "s1");
    expect(lines.map((l) => l.v)).toEqual(["v1", "v1"]);
    expect(lineKey(lines[0])).not.toBe(lineKey(lines[1]));
    expect(readCartCookie("lc_s1=%7Bpas-du-json", "s1")).toEqual([]);
  });
});

describe("objets Shopify", () => {
  const product = {
    id: "p1", storeId: "s", title: "Bol", handle: "bol", description: "<p>Un bol</p>", translations: JSON.stringify({ en: { title: "Bowl" } }), status: "active", images: JSON.stringify(["/a.jpg", "/b.jpg"]), options: JSON.stringify([{ name: "Taille", values: ["S", "M"] }]), hue: 1, seoTitle: "", seoDescription: "", isGiftCard: false, continueSelling: false, subscriptionInterval: null, subscriptionDiscountBps: 0, createdAt: new Date("2026-01-01"), updatedAt: new Date(), metafields: "{}", complementaryIds: "[]", vendor: "Atelier", productType: "Céramique", tags: "fait-main, bleu", category: "", taxable: true,
    variants: [
      { id: "v1", productId: "p1", title: "S", optionValues: JSON.stringify(["S"]), priceCents: 2000, compareAtCents: 2500, costCents: null, image: "/b.jpg", weightGrams: 300, sku: "B-S", stock: 0, position: 0, barcode: "", lengthMm: null, widthMm: null, heightMm: null },
      { id: "v2", productId: "p1", title: "M", optionValues: JSON.stringify(["M"]), priceCents: 2400, compareAtCents: null, costCents: null, image: null, weightGrams: 400, sku: "B-M", stock: 3, position: 1, barcode: "", lengthMm: null, widthMm: null, heightMm: null },
    ],
    collections: [{ collection: { handle: "bols" } }],
  };
  it("expose prix, variantes, options et disponibilité comme Shopify", () => {
    const p = shopifyProduct(product, "/s/demo", "en", 500);
    expect(p.title).toBe("Bowl");
    expect(p.url).toBe("/s/demo/products/bol");
    expect(p.price).toBe(2100); // 20 € + 5 % (marché)
    expect(p.price_max).toBe(2520);
    expect(p.price_varies).toBe(true);
    expect(p.available).toBe(true);
    expect(p.variants[0].available).toBe(false);
    expect(p.variants[0].featured_image?.src).toBe("/b.jpg");
    expect(p.selected_or_first_available_variant?.id).toBe("v2");
    expect(p.options_with_values[0]).toMatchObject({ name: "Taille", values: ["S", "M"] });
    expect(p.tags).toEqual(["fait-main", "bleu"]);
    expect(p.has_only_default_variant).toBe(false);
    expect(shopifyProduct(product, "/s/demo", "fr", 0, "v1").selected_variant?.id).toBe("v1");
  });
  it("formate les prix selon la devise", () => {
    expect(moneyFormat("EUR").format).toBe("{{amount_with_comma_separator}} €");
    expect(moneyFormat("USD").format).toBe("${{amount}}");
    expect(moneyFormat("XOF").format).toContain("XOF");
  });
});
