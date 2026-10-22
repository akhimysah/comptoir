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
    id: "p1", storeId: "s", title: "Bol", handle: "bol", description: "<p>Un bol</p>", translations: JSON.stringify({ en: { title: "Bowl" } }), status: "active", images: JSON.stringify(["/a.jpg", "/b.jpg"]), options: JSON.stringify([{ name: "Taille", values: ["S", "M"] }]), hue: 1, seoTitle: "", seoDescription: "", isGiftCard: false, continueSelling: false, subscriptionInterval: null, subscriptionDiscountBps: 0, createdAt: new Date("2026-01-01"), updatedAt: new Date(), metafields: "{}", complementaryIds: "[]", vendor: "Atelier", productType: "Céramique", tags: "fait-main, bleu", category: "", taxable: true, templateSuffix: "", videoUrl: "https://youtu.be/dQw4w9WgXcQ",
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
    const video = p.media[p.media.length - 1] as unknown as { media_type: string; host: string; external_id: string };
    expect(video).toMatchObject({ media_type: "external_video", host: "youtube", external_id: "dQw4w9WgXcQ" });
  });
  it("formate les prix selon la devise", () => {
    expect(moneyFormat("EUR").format).toBe("{{amount_with_comma_separator}} €");
    expect(moneyFormat("USD").format).toBe("${{amount}}");
    expect(moneyFormat("XOF").format).toContain("XOF");
  });
});

describe("dimensions des images", async () => {
  const { imageSize } = await import("@/lib/image-store");
  it("lit l'en-tête PNG, GIF et JPEG", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("0000000d49484452", "hex"), Buffer.alloc(8)]);
    png.writeUInt32BE(640, 16); png.writeUInt32BE(360, 20);
    expect(imageSize(png)).toEqual({ width: 640, height: 360 });
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(4)]); gif.writeUInt16LE(12, 6); gif.writeUInt16LE(34, 8);
    expect(imageSize(gif)).toEqual({ width: 12, height: 34 });
    // JPEG minimal : SOI, APP0 vide, SOF0 avec 480x320
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), Buffer.from([0x01, 0x40, 0x01, 0xe0]), Buffer.alloc(12)]);
    expect(imageSize(jpg)).toEqual({ width: 480, height: 320 });
    expect(imageSize(Buffer.from("pas une image"))).toBeNull();
  });
});

describe("adresses du CDN Shopify figées dans un thème exporté", async () => {
  const { rewriteShopifyCdn } = await import("@/lib/liquid/source");
  it("sont ramenées vers les fichiers du thème", () => {
    const js = `import {Delegate} from "//cdn.shopify.com/s/files/1/0604/5207/7740/t/57/assets/vendor.min.js?v=20880576495916334881691263407";`;
    expect(rewriteShopifyCdn(js, { id: "t1", version: 3 }, "/s/demo")).toBe(`import {Delegate} from "/s/demo/assets/vendor.min.js?v=3&t=t1";`);
    expect(rewriteShopifyCdn('<img src="https://cdn.shopify.com/s/files/1/2/3/files/photo.jpg">', { id: "t1", version: 3 }, "")).toContain("cdn.shopify.com/s/files/1/2/3/files/photo.jpg");
    expect(rewriteShopifyCdn(`import "//cdn.shopify.com/s/files/1/2/3/t/5/assets/theme.js?548";`, { id: "t1", version: 3 }, "")).toBe(`import "/assets/theme.js?v=3&t=t1";`);
  });
});

describe("mise à jour d'un thème de la plateforme", async () => {
  const { db } = await import("@/lib/db");
  const { installPlatformTheme } = await import("@/lib/liquid/source");
  it("installe la nouvelle version en gardant les réglages et gabarits personnalisés de l'ancienne", async () => {
    await db.user.deleteMany();
    const owner = await db.user.create({ data: { email: `up-${Date.now()}@test.local`, name: "M", passwordHash: "x" } });
    const store = await db.store.create({ data: { ownerId: owner.id, name: "B", slug: `up-${Date.now()}`, theme: "{}" } });
    const platform = await db.platformTheme.create({ data: { name: "Thème", version: "2.0.0", ready: true, files: { create: [
      { path: "layout/theme.liquid", text: "v2 {{ content_for_layout }}" }, { path: "config/settings_data.json", text: '{"current":{"color":"#000"}}' }, { path: "templates/index.json", text: '{"sections":{},"order":[]}' }, { path: "config/settings_schema.json", text: "[]" },
    ] } } });
    const old = await db.storeTheme.create({ data: { storeId: store.id, name: "Thème 1.0", theme: "{}", engine: "liquid", platformThemeId: platform.id, platformVersion: "1.0.0", files: { create: [
      { path: "layout/theme.liquid", text: "v1" }, { path: "config/settings_data.json", text: '{"current":{"color":"#abc"}}' }, { path: "templates/index.json", text: '{"sections":{"hero":{"type":"hero"}},"order":["hero"]}' }, { path: "templates/page.contact.json", text: '{"sections":{},"order":[]}' },
    ] } } });
    const next = await installPlatformTheme(store.id, platform.id, "Thème 2.0.0", old.id);
    const file = async (path: string) => (await db.themeFile.findUnique({ where: { themeId_path: { themeId: next.id, path } } }))?.text;
    expect(next.platformVersion).toBe("2.0.0");
    expect(await file("layout/theme.liquid")).toBe("v2 {{ content_for_layout }}"); // code du thème : nouvelle version
    expect(await file("config/settings_data.json")).toBe('{"current":{"color":"#abc"}}'); // réglages : conservés
    expect(await file("templates/index.json")).toContain("hero"); // gabarit personnalisé : conservé
    expect(await file("templates/page.contact.json")).toBeDefined(); // gabarit ajouté par le marchand : conservé
    await db.platformTheme.delete({ where: { id: platform.id } });
  });
});

describe("métachamps au format Shopify", async () => {
  const { metafieldObjects } = await import("@/lib/liquid/data");
  const { renderPage } = await import("@/lib/liquid/engine");
  const { memorySource } = await import("./liquid/memory-source");
  const { samplePageData } = await import("./liquid/sample-data");
  it("s'affichent comme leur valeur et exposent value / type, y compris dans un thème", async () => {
    const mf = metafieldObjects(JSON.stringify({ matiere: "Grès", poids: "350", lavable: "true" }), [{ key: "poids", type: "number", unit: "g" }, { key: "lavable", type: "boolean", unit: "" }]);
    expect(String(mf.custom.matiere)).toBe("Grès");
    expect((mf.custom.poids as { value: number; type: string }).value).toBe(350);
    expect(String(mf.custom.poids)).toBe("350 g");
    expect((mf.custom.lavable as { value: boolean; type: string })).toMatchObject({ value: true, type: "boolean" });
    const data = samplePageData();
    const product = { ...data.collections[0].products[0], metafields: mf };
    const source = memorySource({ "layout/theme.liquid": "{{ content_for_layout }}", "templates/product.liquid": "{{ product.metafields.custom.matiere }}|{{ product.metafields.custom.matiere.value }}|{% if product.metafields.custom.lavable.value %}lavable{% endif %}|{{ product.metafields.custom.absent.value | default: 'rien' }}" });
    const { html } = await renderPage(source, { ...data, template: "product", product });
    expect(html).toContain("Grès|Grès|lavable|rien");
  });
});

describe("modèle de thème (gabarits alternatifs)", async () => {
  const { db } = await import("@/lib/db");
  const { templateSuffixes } = await import("@/lib/theme-templates");
  it("liste les suffixes des gabarits du thème publié et garde celui déjà choisi", async () => {
    await db.user.deleteMany();
    const owner = await db.user.create({ data: { email: `tpl-${Date.now()}@test.local`, name: "M", passwordHash: "x" } });
    const store = await db.store.create({ data: { ownerId: owner.id, name: "B", slug: `tpl-${Date.now()}`, theme: "{}" } });
    const theme = await db.storeTheme.create({ data: { storeId: store.id, name: "T", theme: "{}", engine: "liquid", files: { create: [{ path: "templates/product.json", text: "{}" }, { path: "templates/product.pre-order.json", text: "{}" }, { path: "templates/product.bundle.liquid", text: "" }, { path: "templates/page.contact.json", text: "{}" }] } } });
    const published = await db.store.update({ where: { id: store.id }, data: { publishedThemeId: theme.id } });
    expect(await templateSuffixes(published, "product")).toEqual(["bundle", "pre-order"]);
    expect(await templateSuffixes(published, "page", "ancien")).toEqual(["ancien", "contact"]);
    expect(await templateSuffixes({ publishedThemeId: null }, "collection")).toEqual([]);
  });
});

describe("vidéos YouTube et Vimeo", async () => {
  const { parseVideo } = await import("@/lib/video");
  it("reconnaît les adresses courantes et refuse le reste", () => {
    expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toMatchObject({ host: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideo("https://youtube.com/shorts/dQw4w9WgXcQ")?.embed).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(parseVideo("https://vimeo.com/123456789")).toMatchObject({ host: "vimeo", id: "123456789" });
    expect(parseVideo("https://exemple.fr/video.mp4")).toBeNull();
    expect(parseVideo("javascript:alert(1)")).toBeNull();
  });
});
