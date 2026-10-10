import { describe, expect, it } from "vitest";
import type { CardProduct } from "@/components/store/types";
import { fill, templateText } from "@/lib/email-templates";
import { applyFilters, computeFacets, parseFilters } from "@/lib/filters";
import { cleanMetafields, formatMetafield } from "@/lib/metafields";
import { editBlocker } from "@/lib/order-edit";
import { convertShopify, htmlToText, isShopifyCsv } from "@/lib/shopify-import";
import { trackingLink } from "@/lib/tracking";

describe("e-mails personnalisés", () => {
  it("remplace les variables en gardant la ponctuation française", () => {
    expect(fill("Merci {{prenom}}, c'est parti !", { prenom: "Camille" })).toBe("Merci Camille, c'est parti !");
    expect(fill("{{prenom}}, votre panier vous attend", { prenom: "" })).toBe("Votre panier vous attend");
    expect(fill("Merci pour votre commande, {{prenom}} !", {})).toBe("Merci pour votre commande !");
  });
  it("revient au texte d'origine pour un champ vide", () => {
    const t = templateText(JSON.stringify({ refund: { subject: "", title: "Remboursé !", intro: "" } }), "refund");
    expect(t.title).toBe("Remboursé !");
    expect(t.subject).toContain("{{montant}}");
  });
});

describe("filtres de la boutique", () => {
  const p = (id: string, price: number, extra: Partial<CardProduct> = {}): CardProduct => ({ id, handle: id, title: id, priceCents: price, maxPriceCents: price, compareAtCents: null, image: null, hue: 0, soldOut: false, collectionHandles: [], rating: null, options: [], ...extra });
  const list = [
    p("tablier", 3900, { options: [{ name: "Taille", values: ["S", "M"] }, { name: "Couleur", values: ["Sable"] }], collectionHandles: ["deco"] }),
    p("bol", 2800, { compareAtCents: 3400, collectionHandles: ["bols"] }),
    p("theiere", 8900, { soldOut: true, rating: { avg: 5, count: 1 } }),
  ];
  it("combine prix, option, promotion, disponibilité et avis", () => {
    const ids = (q: Record<string, string | string[]>) => applyFilters(list, parseFilters(q)).map((x) => x.id);
    expect(ids({ max: "50" })).toEqual(["tablier", "bol"]);
    expect(ids({ o: "taille:m" })).toEqual(["tablier"]);
    expect(ids({ o: ["Taille:S", "Couleur:Encre"] })).toEqual([]);
    expect(ids({ promo: "1" })).toEqual(["bol"]);
    expect(ids({ dispo: "1" })).toEqual(["tablier", "bol"]);
    expect(ids({ note: "4" })).toEqual(["theiere"]);
    expect(ids({ c: "bols" })).toEqual(["bol"]);
  });
  it("compte les produits par valeur", () => {
    const f = computeFacets(list, [{ handle: "bols", title: "Bols" }]);
    expect(f.inStock).toBe(2);
    expect(f.onSale).toBe(1);
    expect(f.options.find((o) => o.key === "taille")?.values.map((v) => v.value)).toEqual(["S", "M"]);
  });
});

describe("import Shopify", () => {
  it("reconnaît l'export et convertit variantes, statut et photos", () => {
    const header = ["Handle", "Title", "Body (HTML)", "Type", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Inventory Qty", "Variant Price", "Variant Compare At Price", "Image Src", "Image Position", "Status"];
    expect(isShopifyCsv(header)).toBe(true);
    const { table, images } = convertShopify([
      header,
      ["tshirt", "T-shirt", "<p>Doux &amp; léger</p>", "Vêtements", "TRUE", "Taille", "S", "TS-S", "5", "35.00", "45.00", "https://cdn.shopify.com/a.png", "1", "active"],
      ["tshirt", "", "", "", "", "", "M", "TS-M", "8", "35.00", "", "", "", ""],
      ["tshirt", "", "", "", "", "", "", "", "", "", "", "https://cdn.shopify.com/b.png", "2", ""],
      ["carnet", "Carnet", "A5<br>96 pages", "Papeterie", "TRUE", "Title", "Default Title", "C-1", "12", "9.90", "", "", "", "draft"],
    ]);
    expect(table).toHaveLength(4); // en-tête + 3 variantes (la ligne « photo seule » n'en crée pas)
    const head = table[0];
    const get = (row: string[], c: string) => row[head.indexOf(c)];
    expect(get(table[1], "Description")).toBe("Doux & léger");
    expect(get(table[1], "Collections")).toBe("Vêtements");
    expect(get(table[2], "Option1 valeur")).toBe("M");
    expect(get(table[3], "Option1 nom")).toBe(""); // « Default Title » → produit simple
    expect(get(table[3], "Statut")).toBe("brouillon");
    expect(images.product.get("tshirt")).toEqual(["https://cdn.shopify.com/a.png", "https://cdn.shopify.com/b.png"]);
  });
  it("transforme le HTML en texte lisible", () => {
    expect(htmlToText("<ul><li>Lin</li><li>30 &deg;C</li></ul>")).toContain("- Lin");
  });
});

describe("divers", () => {
  it("valide les champs personnalisés", () => {
    const defs = [
      { key: "matiere", name: "Matière", type: "choice", choices: JSON.stringify(["Grès", "Porcelaine"]), unit: "", showOnProduct: true, filterable: true },
      { key: "poids", name: "Poids", type: "number", choices: "[]", unit: "g", showOnProduct: true, filterable: false },
    ];
    expect(cleanMetafields(defs, { matiere: "Grès", poids: "350,5", inconnu: "x" })).toEqual({ values: { matiere: "Grès", poids: "350.5" } });
    expect(cleanMetafields(defs, { matiere: "Bois" }).error).toMatch(/Matière/);
    expect(formatMetafield(defs[1], "350.5")).toBe("350,5 g");
  });
  it("construit le lien de suivi du transporteur", () => {
    expect(trackingLink({ trackingCarrier: "colissimo", trackingNumber: "6A123", trackingUrl: "" })).toContain("code=6A123");
    expect(trackingLink({ trackingCarrier: "other", trackingNumber: "X1", trackingUrl: "javascript:alert(1)" })).toBeNull();
  });
  it("n'autorise la modification que des commandes non payées", () => {
    const base = { cancelledAt: null, paymentStatus: "pending", fulfillmentStatus: "unfulfilled", paymentMethod: "manual", giftCardCents: 0, subscriptionId: null };
    expect(editBlocker(base)).toBeNull();
    expect(editBlocker({ ...base, paymentStatus: "paid" })).toBe("paid");
    expect(editBlocker({ ...base, paymentMethod: "stripe" })).toMatch(/en ligne/);
    expect(editBlocker({ ...base, giftCardCents: 500 })).toMatch(/carte cadeau/);
  });
});
