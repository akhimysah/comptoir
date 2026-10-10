import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrder, markOrderPaid, OrderError } from "@/lib/orders";
import { priceCart } from "@/lib/pricing";
import { refundOrder } from "@/lib/refunds";

/** Parcours d'achat complet sur une base de test : prix, commande, paiement, stock, réductions, remboursements. */
let store: Awaited<ReturnType<typeof db.store.create>>;
let bol: { id: string };
let rare: { id: string };
const buyer = (email: string) => ({ email, name: "Client Test", address: { line1: "1 rue Test", zip: "75001", city: "Paris", country: "France" }, note: "" });

beforeEach(async () => {
  // Base vide à chaque test (les liaisons sont supprimées en cascade).
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `owner-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  store = await db.store.create({ data: { ownerId: owner.id, name: "Boutique Test", slug: `test-${Date.now()}`, theme: "{}", shippingCents: 490, freeShippingFromCents: 6000 } });
  const p1 = await db.product.create({ data: { storeId: store.id, title: "Bol", handle: "bol", status: "active", variants: { create: { title: "Par défaut", priceCents: 2000, stock: 5 } } }, include: { variants: true } });
  const p2 = await db.product.create({ data: { storeId: store.id, title: "Pièce unique", handle: "rare", status: "active", variants: { create: { title: "Par défaut", priceCents: 5000, stock: 1 } } }, include: { variants: true } });
  bol = p1.variants[0];
  rare = p2.variants[0];
});

const stockOf = async (id: string) => (await db.variant.findUniqueOrThrow({ where: { id } })).stock;

describe("passage de commande", () => {
  it("calcule le panier côté serveur, crée la commande et baisse le stock au paiement", async () => {
    const cart = await priceCart(store, [{ variantId: bol.id, quantity: 2 }]);
    expect(cart.subtotalCents).toBe(4000);
    expect(cart.shippingCents).toBe(490); // sous le seuil de livraison offerte
    const order = await createOrder(store, cart, buyer("a@exemple.fr"), "demo");
    expect(await stockOf(bol.id)).toBe(5); // pas encore payée
    await markOrderPaid(order.id);
    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.totalCents).toBe(4490);
    expect(await stockOf(bol.id)).toBe(3);
    expect(await db.mailLog.count({ where: { to: "a@exemple.fr" } })).toBe(1); // confirmation (les adresses .local ne reçoivent rien)
  });

  it("n'accepte jamais plus que le stock disponible", async () => {
    const cart = await priceCart(store, [{ variantId: rare.id, quantity: 3 }]);
    expect(cart.lines[0].quantity).toBe(1);
    expect(cart.notices.length).toBeGreaterThan(0);
  });

  it("ignore les prix envoyés par le navigateur", async () => {
    const cart = await priceCart(store, [{ variantId: bol.id, quantity: 1, priceCents: 1 } as never]);
    expect(cart.lines[0].priceCents).toBe(2000);
  });
});

describe("réductions utilisées en même temps", () => {
  it("une carte cadeau de 30 € ne peut pas être dépensée deux fois", async () => {
    await db.giftCard.create({ data: { storeId: store.id, code: "CADEAUTEST01", initialCents: 3000, balanceCents: 3000 } });
    const attempt = async (i: number) => {
      const cart = await priceCart(store, [{ variantId: bol.id, quantity: 2 }], null, {}, "CADEAUTEST01");
      if (cart.giftCardError) return "refus"; // comme la route de paiement : carte épuisée → refus
      return createOrder(store, cart, buyer(`gc${i}@test.local`), "demo").then(() => "ok", (e) => (e instanceof OrderError ? "refus" : Promise.reject(e)));
    };
    const results = await Promise.all([attempt(1), attempt(2), attempt(3)]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect((await db.giftCard.findFirstOrThrow({ where: { code: "CADEAUTEST01" } })).balanceCents).toBe(0);
  });

  it("deux paniers calculés au même moment ne dépensent pas deux fois la carte", async () => {
    await db.giftCard.create({ data: { storeId: store.id, code: "CADEAURACE01", initialCents: 3000, balanceCents: 3000 } });
    const [c1, c2] = await Promise.all([1, 2].map(() => priceCart(store, [{ variantId: bol.id, quantity: 2 }], null, {}, "CADEAURACE01")));
    expect(c1.giftCardCents).toBe(3000);
    expect(c2.giftCardCents).toBe(3000); // les deux voient le solde complet…
    const results = await Promise.allSettled([createOrder(store, c1, buyer("x1@test.local"), "demo"), createOrder(store, c2, buyer("x2@test.local"), "demo")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); // …mais un seul peut l'utiliser
    expect(results.find((r) => r.status === "rejected")?.reason).toBeInstanceOf(OrderError);
    expect((await db.giftCard.findFirstOrThrow({ where: { code: "CADEAURACE01" } })).balanceCents).toBe(0);
  });

  it("un code promo limité à 1 utilisation ne sert qu'une fois", async () => {
    await db.discount.create({ data: { storeId: store.id, code: "UNEFOIS", type: "percent", value: 10, usageLimit: 1 } });
    const attempt = async (i: number) => {
      const cart = await priceCart(store, [{ variantId: bol.id, quantity: 1 }], "UNEFOIS");
      if (cart.discountError) return "refus";
      return createOrder(store, cart, buyer(`d${i}@test.local`), "demo").then(() => "ok", (e) => (e instanceof OrderError ? "refus" : Promise.reject(e)));
    };
    const results = await Promise.all([attempt(1), attempt(2), attempt(3)]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect((await db.discount.findFirstOrThrow({ where: { code: "UNEFOIS" } })).usageCount).toBe(1);
  });
});

describe("remboursements", () => {
  it("trois remboursements simultanés ne remboursent la commande qu'une fois", async () => {
    const cart = await priceCart(store, [{ variantId: bol.id, quantity: 1 }]);
    const order = await createOrder(store, cart, buyer("r@test.local"), "demo");
    await markOrderPaid(order.id);
    const args = { orderId: order.id, storeId: store.id, lines: [], shippingCents: 0, amountCents: order.totalCents, restock: false, reason: "test", author: "test", notify: false };
    const results = await Promise.all([refundOrder(args), refundOrder(args), refundOrder(args)]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.refundedCents).toBe(order.totalCents);
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("remet en stock les articles retournés", async () => {
    const cart = await priceCart(store, [{ variantId: bol.id, quantity: 2 }]);
    const order = await createOrder(store, cart, buyer("s@test.local"), "demo");
    await markOrderPaid(order.id);
    expect(await stockOf(bol.id)).toBe(3);
    const item = (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).id;
    const res = await refundOrder({ orderId: order.id, storeId: store.id, lines: [{ orderItemId: item, quantity: 1 }], shippingCents: 0, amountCents: 2000, restock: true, reason: "", author: "test", notify: false });
    expect(res.error).toBeUndefined();
    expect(await stockOf(bol.id)).toBe(4);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("partially_refunded");
  });
});
