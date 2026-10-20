import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addBusinessDays, deliveryWindow, manualPaymentAt, orderNumber, POLICY_KEYS, policyTemplate, readManualPayments, readPolicies, writePolicies } from "@/lib/checkout-settings";
import { registerMediaFile, deleteMediaFile, mediaFileReferences } from "@/lib/media-files";
import { POST as checkout } from "@/app/api/checkout/route";

// La route de paiement lit les cookies du visiteur (langue, client connecté, session de visite) : hors requête, on les simule vides.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

/** Réglages du processus de paiement : moyens manuels, dates estimées, politiques, bibliothèque de fichiers. */
let store: Awaited<ReturnType<typeof db.store.create>>;
let variantId: string;

const MANUAL = JSON.stringify([
  { key: "bank_transfer", name: "Virement bancaire", instructions: "IBAN FR76 0000 0000 0000 0000 0000 000, référence : votre numéro de commande.", enabled: true },
  { key: "cod", name: "Paiement à la livraison", instructions: "Réglez au livreur.", enabled: false },
]);

beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `co-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  store = await db.store.create({ data: { ownerId: owner.id, name: "Boutique Paiement", slug: `co-${Date.now()}`, theme: "{}", shippingCents: 0, manualPayments: MANUAL, checkoutPhone: "required", checkoutCompany: "optional", orderPrefix: "CMD-", orderSuffix: "-FR" } });
  const p = await db.product.create({ data: { storeId: store.id, title: "Bol", handle: "bol", status: "active", variants: { create: { title: "Par défaut", priceCents: 2000, stock: 5 } } }, include: { variants: true } });
  variantId = p.variants[0].id;
});

const post = (body: Record<string, unknown>) => checkout(new Request("http://localhost/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const buyer = { email: "client@test.local", name: "Client Test", line1: "1 rue Test", zip: "75001", city: "Paris", country: "France", phone: "0600000000" };

describe("jours ouvrés et dates de livraison estimées", () => {
  it("saute les week-ends", () => {
    const friday = new Date(2026, 9, 16, 10); // vendredi 16 octobre 2026
    expect(addBusinessDays(friday, 1).getDate()).toBe(19); // lundi
    expect(addBusinessDays(friday, 5).getDate()).toBe(23); // vendredi suivant
    expect(addBusinessDays(friday, 0).getDate()).toBe(16);
  });

  it("calcule la fenêtre à partir du délai de traitement et du transport", () => {
    const monday = new Date(2026, 9, 12, 10);
    const w = deliveryWindow({ deliveryMinDays: 2, deliveryMaxDays: 4, fulfillmentDays: 1 }, monday)!;
    expect(w.from.getDate()).toBe(15); // jeudi
    expect(w.to.getDate()).toBe(19); // lundi suivant (le week-end ne compte pas)
    expect(deliveryWindow({ deliveryMinDays: null, deliveryMaxDays: 4 })).toBeNull();
  });
});

describe("politiques", () => {
  it("fait l'aller-retour en JSON sans perdre ni inventer de politique", () => {
    const p = readPolicies("{}");
    expect(Object.keys(p)).toEqual([...POLICY_KEYS]);
    p.returns = { body: "Retours sous 30 jours.", published: true };
    const again = readPolicies(writePolicies(p));
    expect(again.returns).toEqual({ body: "Retours sous 30 jours.", published: true });
    expect(again.privacy).toEqual({ body: "", published: false });
    expect(readPolicies("pas du json").terms.published).toBe(false);
    expect(readPolicies(JSON.stringify({ hack: { body: "x", published: true } }))).not.toHaveProperty("hack");
  });

  it("propose un modèle rempli avec les mentions de la boutique", () => {
    const t = policyTemplate("legal", { name: "Atelier", legalName: "Atelier SAS", siret: "123", returnWindowDays: 14 });
    expect(t).toContain("Atelier SAS");
    expect(t).toContain("SIRET : 123");
    expect(t).toContain("conseil juridique");
  });
});

describe("moyens de paiement manuels", () => {
  it("lit la liste et ne retient qu'un moyen activé et nommé", () => {
    expect(readManualPayments(MANUAL)).toHaveLength(2);
    expect(manualPaymentAt(MANUAL, 0)?.name).toBe("Virement bancaire");
    expect(manualPaymentAt(MANUAL, 1)).toBeNull(); // désactivé
    expect(manualPaymentAt(MANUAL, 7)).toBeNull();
    expect(readManualPayments("[1, {\"key\": \"autre\"}]")).toEqual([]);
  });

  it("crée une commande en attente avec les consignes, via la route de paiement", async () => {
    const res = await post({ slug: store.slug, items: [{ variantId, quantity: 1 }], ...buyer, company: "ACME", line2: "Bât. B", manual: 0 });
    expect(res.status).toBe(200);
    const { url } = await res.json();
    const order = await db.order.findFirstOrThrow({ where: { storeId: store.id } });
    expect(url).toContain(`/order/${order.id}`);
    expect(order.paymentMethod).toBe("manual");
    expect(order.paymentStatus).toBe("pending");
    expect(order.paymentInstructions).toContain("IBAN FR76");
    expect(JSON.parse(order.address)).toMatchObject({ line1: "1 rue Test", line2: "Bât. B", company: "ACME", phone: "0600000000" });
    expect(orderNumber(store, order.number)).toBe(`CMD-${order.number}-FR`);
  });

  it("refuse un moyen désactivé et exige le téléphone quand il est obligatoire", async () => {
    expect((await post({ slug: store.slug, items: [{ variantId, quantity: 1 }], ...buyer, manual: 1 })).status).toBe(400);
    const noPhone = await post({ slug: store.slug, items: [{ variantId, quantity: 1 }], ...buyer, phone: "", manual: 0 });
    expect(noPhone.status).toBe(400);
    expect((await noPhone.json()).error).toContain("téléphone");
    expect(await db.order.count({ where: { storeId: store.id } })).toBe(0);
  });
});

describe("bibliothèque de fichiers", () => {
  it("enregistre un fichier une seule fois par adresse et compte ses références", async () => {
    const a = await registerMediaFile(store.id, { url: "/uploads/abc.jpg", name: "photo.jpg", mime: "image/jpeg", size: 1234 });
    const b = await registerMediaFile(store.id, { url: "/uploads/abc.jpg", name: "photo-2.jpg", size: 1234 });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("photo-2.jpg");
    expect(await db.mediaFile.count({ where: { storeId: store.id } })).toBe(1);
    await db.product.create({ data: { storeId: store.id, title: "Tasse", handle: "tasse", images: JSON.stringify(["/uploads/abc.jpg"]) } });
    await db.store.update({ where: { id: store.id }, data: { theme: JSON.stringify({ hero: { image: "/uploads/abc.jpg" } }) } });
    const refs = await mediaFileReferences(store.id, ["/uploads/abc.jpg", "/uploads/none.jpg"]);
    expect(refs.get("/uploads/abc.jpg")).toEqual({ products: 1, theme: true });
    expect(refs.get("/uploads/none.jpg")).toEqual({ products: 0, theme: false });
    expect((await deleteMediaFile(store.id, a.id))?.url).toBe("/uploads/abc.jpg");
    expect(await deleteMediaFile(store.id, a.id)).toBeNull();
  });
});
