import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelUnpaidOrder, confirmTermsOrder, createOrder, markOrderPaid } from "@/lib/orders";
import { PRIMARY, setLocationStock, transferStock } from "@/lib/locations";
import { priceCart } from "@/lib/pricing";
import { refundOrder } from "@/lib/refunds";
import { receiveItems } from "@/lib/purchasing";
import { adjustStock, logAdjustment } from "@/lib/inventory-log";

/** Historique des ajustements de stock : chaque mouvement laisse une trace (variation, stock après, motif, auteur, emplacement). */
let store: Awaited<ReturnType<typeof db.store.create>>;
let bol: { id: string };
const buyer = (email: string) => ({ email, name: "Client Test", address: { line1: "1 rue Test", zip: "75001", city: "Paris", country: "France" }, note: "" });
const history = (variantId: string) => db.inventoryAdjustment.findMany({ where: { variantId }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `owner-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  store = await db.store.create({ data: { ownerId: owner.id, name: "Boutique Test", slug: `inv-${Date.now()}`, theme: "{}", shippingCents: 490 } });
  const p = await db.product.create({ data: { storeId: store.id, title: "Bol", handle: "bol", status: "active", vendor: "Atelier Terre", productType: "Bol", tags: "grès, fait main", variants: { create: { title: "Par défaut", priceCents: 2000, stock: 5, barcode: "3760000000001", lengthMm: 120, widthMm: 120, heightMm: 80 } } }, include: { variants: true } });
  bol = p.variants[0];
});

describe("historique des ajustements", () => {
  it("trace le paiement d'une commande, puis son remboursement avec retour en stock", async () => {
    const cart = await priceCart(store, [{ variantId: bol.id, quantity: 2 }]);
    const order = await createOrder(store, cart, buyer("a@exemple.fr"), "demo");
    expect(await history(bol.id)).toHaveLength(0); // rien tant que la commande n'est pas payée
    await markOrderPaid(order.id);
    let rows = await history(bol.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: -2, after: 3, reason: `Commande #${order.number} payée`, storeId: store.id });

    const item = (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } }));
    const r = await refundOrder({ orderId: order.id, storeId: store.id, lines: [{ orderItemId: item.id, quantity: 1 }], shippingCents: 0, amountCents: 2000, restock: true, reason: "Cassé", author: "Marchand", notify: false });
    expect(r.error).toBeUndefined();
    rows = await history(bol.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ delta: 1, after: 4, author: "Marchand" });
    expect(rows[1].reason).toMatch(/Remboursement/);
    expect((await db.variant.findUniqueOrThrow({ where: { id: bol.id } })).stock).toBe(4);
  });

  it("trace une commande à échéance puis son annulation", async () => {
    const cart = await priceCart(store, [{ variantId: bol.id, quantity: 1 }]);
    const order = await createOrder(store, cart, buyer("pro@exemple.fr"), "terms");
    await confirmTermsOrder(order.id, 30);
    expect((await history(bol.id)).at(-1)).toMatchObject({ delta: -1, after: 4, reason: `Commande #${order.number} à échéance` });
    expect(await cancelUnpaidOrder(order.id, "Marchand")).toBe(true);
    const rows = await history(bol.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ delta: 1, after: 5, reason: `Commande #${order.number} annulée`, author: "Marchand" });
  });

  it("trace l'inventaire, les transferts entre emplacements et la réception fournisseur", async () => {
    await setLocationStock(store.id, bol.id, PRIMARY, 8, { author: "Camille" });
    expect((await history(bol.id)).at(-1)).toMatchObject({ delta: 3, after: 8, reason: "Inventaire", author: "Camille", locationId: PRIMARY });
    // Même quantité : pas de ligne inutile.
    await setLocationStock(store.id, bol.id, PRIMARY, 8);
    expect(await history(bol.id)).toHaveLength(1);

    const depot = await db.location.create({ data: { storeId: store.id, name: "Dépôt" } });
    expect(await transferStock(store.id, bol.id, PRIMARY, depot.id, 3, "Camille")).toEqual({});
    const rows = await history(bol.id);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ delta: -3, after: 8, reason: "Transfert vers Dépôt", locationId: PRIMARY });
    expect(rows[2]).toMatchObject({ delta: 3, after: 8, reason: expect.stringMatching(/^Transfert depuis /), locationId: depot.id });
    expect((await db.variant.findUniqueOrThrow({ where: { id: bol.id } })).stock).toBe(8); // le total ne bouge pas

    const po = await db.purchaseOrder.create({ data: { storeId: store.id, number: 1, status: "ordered", items: { create: { variantId: bol.id, productTitle: "Bol", variantTitle: "Par défaut", sku: "", quantity: 10, costCents: 800 } } }, include: { items: true } });
    const rec = await receiveItems(store.id, po.id, [{ itemId: po.items[0].id, quantity: 4 }], false, "Camille");
    expect(rec.count).toBe(4);
    expect((await history(bol.id)).at(-1)).toMatchObject({ delta: 4, after: 12, reason: "Réception fournisseur (bon n° 1)", author: "Camille" });
  });

  it("n'enregistre jamais une variation nulle et refuse une variante d'une autre boutique", async () => {
    await logAdjustment(db, { storeId: store.id, variantId: bol.id, delta: 0, after: 5, reason: "Rien" });
    expect(await history(bol.id)).toHaveLength(0);
    expect(await adjustStock(db, "autre-boutique", bol.id, 2, "API")).toBeNull();
    expect(await history(bol.id)).toHaveLength(0);
    const v = await adjustStock(db, store.id, bol.id, 2, "API");
    expect(v?.stock).toBe(7);
    expect((await history(bol.id))[0]).toMatchObject({ delta: 2, after: 7, reason: "API" });
  });
});

describe("organisation du produit", () => {
  it("garde fournisseur, type, balises, code-barres et dimensions", async () => {
    const p = await db.product.findFirstOrThrow({ where: { handle: "bol", storeId: store.id }, include: { variants: true } });
    expect(p).toMatchObject({ vendor: "Atelier Terre", productType: "Bol", tags: "grès, fait main", taxable: true, category: "" });
    expect(p.variants[0]).toMatchObject({ barcode: "3760000000001", lengthMm: 120, widthMm: 120, heightMm: 80 });
    // Recherche par fournisseur ou balise, comme dans la liste des produits.
    expect(await db.product.count({ where: { storeId: store.id, OR: [{ title: { contains: "Atelier" } }, { vendor: { contains: "Atelier" } }, { tags: { contains: "fait main" } }] } })).toBe(1);
  });
});
