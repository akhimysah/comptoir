import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { adjustStoreCredit, releaseStoreCredit, reserveStoreCredit, storeCreditHistory } from "@/lib/store-credit";

/** Crédit en magasin : solde par client, mouvements tracés, jamais négatif, réservation atomique. */
let storeId: string;
let customerId: string;

beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `sc-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  const store = await db.store.create({ data: { ownerId: owner.id, name: "Boutique", slug: `sc-${Date.now()}`, theme: "{}", storeCreditEnabled: true } });
  storeId = store.id;
  customerId = (await db.customer.create({ data: { storeId, email: "credit@test.local", name: "Client" } })).id;
});

const balance = async () => (await db.customer.findUniqueOrThrow({ where: { id: customerId } })).storeCreditCents;

describe("crédit en magasin", () => {
  it("crédite, débite et refuse de passer sous zéro", async () => {
    expect(await adjustStoreCredit(storeId, customerId, 2000, "Geste commercial", "Marchand")).toBeTruthy();
    expect(await balance()).toBe(2000);
    expect(await adjustStoreCredit(storeId, customerId, -2500, "Trop")).toBeNull();
    expect(await balance()).toBe(2000);
    expect((await storeCreditHistory(customerId)).map((e) => e.deltaCents)).toEqual([2000]);
  });

  it("deux commandes simultanées ne dépensent pas deux fois le même crédit, et l'annulation le rend", async () => {
    await adjustStoreCredit(storeId, customerId, 1500, "Remboursement en crédit");
    const results = await Promise.all([reserveStoreCredit(storeId, customerId, 1500, "o1"), reserveStoreCredit(storeId, customerId, 1500, "o2")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance()).toBe(0);
    await releaseStoreCredit(storeId, customerId, 1500, "o1");
    expect(await balance()).toBe(1500);
  });

  it("ignore un client d'une autre boutique", async () => {
    expect(await adjustStoreCredit("autre-boutique", customerId, 500, "x")).toBeNull();
    expect(await balance()).toBe(0);
  });
});
