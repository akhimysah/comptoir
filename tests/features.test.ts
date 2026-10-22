import { describe, expect, it } from "vitest";
import type { CardProduct } from "@/components/store/types";
import { fill, templateText } from "@/lib/email-templates";
import { applyFilters, computeFacets, parseFilters } from "@/lib/filters";
import { cleanMetafields, formatMetafield } from "@/lib/metafields";
import { editBlocker } from "@/lib/order-edit";
import { convertShopify, htmlToText, isShopifyCsv } from "@/lib/shopify-import";
import { trackingLink } from "@/lib/tracking";
import { discountCountries, discountEligibility } from "@/lib/pricing";
import { assessRisk, isDisposableEmail } from "@/lib/risk";
import { deliveryStatus, fulfillByLabel, fulfillByOf, orderChannel, splitOrderTags } from "@/components/admin/OrderSummary";

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
  it("reprend fournisseur, type, balises et code-barres de Shopify", () => {
    const header = ["Handle", "Title", "Vendor", "Product Category", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Barcode", "Variant Price", "Status"];
    const { table } = convertShopify([
      header,
      ["bougie", "Bougie", "Maison Cire", "Maison & Jardin > Décoration", "Bougie", "été, parfumée", "TRUE", "Title", "Default Title", "B-1", "3760000000001", "19.00", "active"],
    ]);
    const get = (row: string[], c: string) => row[table[0].indexOf(c)];
    expect(get(table[1], "Fournisseur")).toBe("Maison Cire");
    expect(get(table[1], "Type de produit")).toBe("Bougie");
    expect(get(table[1], "Catégorie")).toBe("Maison & Jardin > Décoration");
    expect(get(table[1], "Balises")).toBe("été, parfumée");
    expect(get(table[1], "Code-barres")).toBe("3760000000001");
    expect(get(table[1], "Collections")).toBe("Bougie"); // le type Shopify sert toujours de collection
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

describe("analyse du risque d'une commande", () => {
  const order = (extra: Partial<Parameters<typeof assessRisk>[0]> = {}) => ({ email: "client@exemple.fr", totalCents: 4000, paymentMethod: "stripe", stripePaymentIntentId: "pi_1", address: JSON.stringify({ country: "France" }), ...extra });
  const ctx = (extra: Partial<Parameters<typeof assessRisk>[1]> = {}) => ({ previousOrders: 2, averageOrderCents: 5000, storeCountry: "France", ordersLast24h: 1, cancelledOrRefunded: 0, ...extra });
  it("est faible pour un client connu qui paie par carte", () => {
    const r = assessRisk(order(), ctx());
    expect(r.level).toBe("low");
    expect(r.notes.some((n) => n.includes("Stripe"))).toBe(true);
  });
  it("monte d'un cran par indice : première commande très élevée, autre pays, adresse jetable, rafale de commandes", () => {
    expect(assessRisk(order({ totalCents: 20000 }), ctx({ previousOrders: 0 })).level).toBe("medium");
    expect(assessRisk(order({ address: JSON.stringify({ country: "Belgique" }) }), ctx()).level).toBe("medium");
    expect(assessRisk(order({ address: JSON.stringify({ country: "FR" }) }), ctx()).level).toBe("low"); // « FR » = France
    const high = assessRisk(order({ email: "x@yopmail.com", totalCents: 20000 }), ctx({ previousOrders: 0, ordersLast24h: 3 }));
    expect(high.level).toBe("high");
    expect(high.notes.length).toBeGreaterThanOrEqual(3);
  });
  it("un historique d'annulations déjà traitées rassure", () => {
    expect(assessRisk(order({ address: JSON.stringify({ country: "Espagne" }) }), ctx({ cancelledOrRefunded: 1 })).level).toBe("low");
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
  });
});

describe("colonnes de la liste des commandes", () => {
  const base = { paidAt: new Date("2026-10-10T10:00:00Z"), paymentStatus: "paid", fulfillmentStatus: "unfulfilled", cancelledAt: null };
  it("« Traiter avant le » : paiement + délai, en retard en jours", () => {
    const by = fulfillByOf(base, 2)!;
    expect(by.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(fulfillByLabel(by, new Date("2026-10-16T08:00:00Z"))).toEqual({ label: "Il y a 4 jours", overdue: true });
    expect(fulfillByLabel(by, new Date("2026-10-12T20:00:00Z"))).toEqual({ label: "Aujourd'hui", overdue: false });
    expect(fulfillByOf({ ...base, fulfillmentStatus: "fulfilled" }, 2)).toBeNull();
    expect(fulfillByOf({ ...base, paymentStatus: "pending" }, 2)).toBeNull();
  });
  it("canal, statut de livraison et balises", () => {
    expect(orderChannel({ paymentMethod: "pos_card" })).toBe("pos");
    expect(orderChannel({ paymentMethod: "terms" })).toBe("admin");
    expect(orderChannel({ paymentMethod: "stripe" })).toBe("online");
    const d = { fulfillmentStatus: "fulfilled", deliveredAt: null, trackingNumber: "", deliveryMethod: "shipping", cancelledAt: null };
    expect(deliveryStatus(d)?.label).toBe("Expédiée");
    expect(deliveryStatus({ ...d, trackingNumber: "8L123" })?.label).toBe("Suivi ajouté");
    expect(deliveryStatus({ ...d, deliveredAt: new Date() })?.label).toBe("Livrée");
    expect(deliveryStatus({ ...d, fulfillmentStatus: "unfulfilled" })).toBeNull();
    expect(splitOrderTags("VIP, urgent,, vip ")).toEqual(["vip", "urgent"]);
  });
});

describe("admissibilité des remises", () => {
  const none = async () => null;
  it("tous les clients, clients précis (connecté ou non), et pays de la livraison offerte", async () => {
    expect(await discountEligibility({ storeId: "s", eligibility: "all", eligibleIds: "[]" }, null, none)).toBe("ok");
    const some = { storeId: "s", eligibility: "customers", eligibleIds: JSON.stringify(["c1", "c2"]) };
    expect(await discountEligibility(some, null, none)).toBe("signin");
    expect(await discountEligibility(some, "c2", none)).toBe("ok");
    expect(await discountEligibility(some, "c3", none)).toBe("no");
    expect(discountCountries({ countries: "[]" })).toEqual([]);
    expect(discountCountries({ countries: JSON.stringify(["France", "Belgique"]) })).toEqual(["France", "Belgique"]);
    expect(discountCountries({ countries: "pas du json" })).toEqual([]);
  });
});

describe("marchés : rattachement par pays", async () => {
  const { adjustPrice, marketForCountry } = await import("@/lib/markets");
  const m = (id: string, countries: string[]) => ({ id, storeId: "s", name: id, countries: JSON.stringify(countries), currency: "", locale: "", priceAdjustBps: 0, enabled: true, position: 0, createdAt: new Date() });
  it("trouve le marché d'un pays et arrondit les prix ajustés", () => {
    const markets = [m("eu", ["Belgique", "Allemagne"]), m("ch", ["Suisse"])];
    expect(marketForCountry(markets, "Allemagne")?.id).toBe("eu");
    expect(marketForCountry(markets, "Canada")).toBeNull();
    expect(adjustPrice(1999, 500)).toBe(2099);
    expect(adjustPrice(1999, -1000)).toBe(1799);
    expect(adjustPrice(1999, 0)).toBe(1999);
  });
});

describe("menus multiples (comme les menus de Shopify)", async () => {
  const { allMenus, storeMenus } = await import("@/lib/navigation");
  it("lit les menus créés par le marchand et ignore un menu mal formé", async () => {
    const item = { id: "a1", title: "Aide", type: "url" as const, ref: "", url: "/pages/aide", children: [] };
    const menus = await storeMenus({ id: "s", menus: JSON.stringify({ main: [item], footer: [], extra: [{ handle: "liens-rapides", title: "Liens rapides", items: [item] }, { handle: "Mauvais Handle", title: "x", items: [] }] }) });
    expect(menus.extra).toHaveLength(0); // un seul élément invalide suffit à écarter la liste : on repart proprement
    const ok = await storeMenus({ id: "s", menus: JSON.stringify({ main: [item], footer: [], extra: [{ handle: "liens-rapides", title: "Liens rapides", items: [item] }] }) });
    expect(ok.extra.map((e) => e.handle)).toEqual(["liens-rapides"]);
    expect(allMenus(ok).map((m) => m.key)).toEqual(["main", "footer", "liens-rapides"]);
  });
});
