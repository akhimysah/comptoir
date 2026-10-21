import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Les sessions posent un cookie via next/headers : remplacé par un bocal en mémoire pour le test.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => { jar.set(k, v); } }) }));

/** Comptes clients avec mot de passe (thèmes Shopify) : inscription, connexion, réinitialisation. */
let storeId: string;
beforeEach(async () => {
  await db.user.deleteMany();
  jar.clear();
  const owner = await db.user.create({ data: { email: `cp-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  storeId = (await db.store.create({ data: { ownerId: owner.id, name: "Boutique", slug: `cp-${Date.now()}`, theme: "{}" } })).id;
});

describe("comptes clients avec mot de passe", () => {
  it("inscrit, connecte, refuse un mauvais mot de passe et une inscription en double", async () => {
    const { registerCustomer, loginWithPassword, openCustomerSession, getCustomer } = await import("@/lib/customer-auth");
    expect((await registerCustomer(storeId, { email: "pas-un-email", password: "motdepasse" })).error).toBeTruthy();
    expect((await registerCustomer(storeId, { email: "lea@test.local", password: "court" })).error).toMatch(/8/);
    const r = await registerCustomer(storeId, { email: "Lea@Test.local", password: "motdepasse1", firstName: "Léa", lastName: "Martin", acceptsMarketing: true });
    expect(r.customerId).toBeTruthy();
    const row = await db.customer.findUniqueOrThrow({ where: { id: r.customerId! } });
    expect(row.email).toBe("lea@test.local");
    expect(row.name).toBe("Léa Martin");
    expect(row.acceptsMarketing).toBe(true);
    expect(row.passwordHash).not.toContain("motdepasse1");
    expect((await registerCustomer(storeId, { email: "lea@test.local", password: "motdepasse2" })).error).toMatch(/existe déjà/);
    expect((await loginWithPassword(storeId, "lea@test.local", "faux")).error).toBeTruthy();
    const ok = await loginWithPassword(storeId, "lea@test.local", "motdepasse1");
    expect(ok.customerId).toBe(r.customerId);
    await openCustomerSession(storeId, ok.customerId!);
    expect((await getCustomer(storeId))?.id).toBe(r.customerId);
  });

  it("réinitialise avec un jeton à usage unique et ferme les anciennes sessions", async () => {
    const { registerCustomer, createPasswordReset, resetCustomerPassword, loginWithPassword, openCustomerSession, getCustomer } = await import("@/lib/customer-auth");
    const { customerId } = await registerCustomer(storeId, { email: "max@test.local", password: "ancienmdp1" });
    await openCustomerSession(storeId, customerId!);
    expect(await createPasswordReset(storeId, "inconnu@test.local")).toBeNull();
    const reset = (await createPasswordReset(storeId, "max@test.local"))!;
    expect((await resetCustomerPassword(storeId, customerId!, "mauvais-jeton", "nouveaumdp1")).error).toBeTruthy();
    expect((await resetCustomerPassword(storeId, customerId!, reset.token, "nouveaumdp1")).ok).toBe(true);
    expect((await resetCustomerPassword(storeId, customerId!, reset.token, "encoreun1")).error).toBeTruthy(); // déjà utilisé
    expect((await loginWithPassword(storeId, "max@test.local", "nouveaumdp1")).customerId).toBe(customerId);
    expect(await getCustomer(storeId)).toBeNull(); // session précédente fermée
  });

  it("un compte créé par code de connexion peut ensuite choisir un mot de passe", async () => {
    const { registerCustomer } = await import("@/lib/customer-auth");
    await db.customer.create({ data: { storeId, email: "code@test.local", name: "Code" } });
    expect((await registerCustomer(storeId, { email: "code@test.local", password: "motdepasse1" })).customerId).toBeTruthy();
    expect((await db.customer.findUniqueOrThrow({ where: { storeId_email: { storeId, email: "code@test.local" } } })).passwordHash).toBeTruthy();
  });
});
