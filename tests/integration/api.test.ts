import { createServer } from "http";
import type { AddressInfo } from "net";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { newApiKey } from "@/lib/api";
import { createOrder, markOrderPaid } from "@/lib/orders";
import { priceCart } from "@/lib/pricing";
import { checkWebhookUrl, isPrivateAddress, sign } from "@/lib/webhooks";
import { GET as listProducts } from "@/app/api/v1/products/route";
import { PATCH as patchVariant } from "@/app/api/v1/variants/[id]/route";

/** API publique : clés, droits, cloisonnement entre boutiques, webhooks signés. */
let store: Awaited<ReturnType<typeof db.store.create>>;
let other: Awaited<ReturnType<typeof db.store.create>>;
let variantId: string;
let otherVariantId: string;

const keyFor = async (storeId: string, scopes: string[]) => {
  const k = newApiKey();
  await db.apiKey.create({ data: { storeId, name: "Test", prefix: k.prefix, keyHash: k.keyHash, scopes: JSON.stringify(scopes) } });
  return k.key;
};
const call = (url: string, key: string | null, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, { ...init, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" } });

beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `api-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  store = await db.store.create({ data: { ownerId: owner.id, name: "Boutique API", slug: `api-${Date.now()}`, theme: "{}" } });
  other = await db.store.create({ data: { ownerId: owner.id, name: "Autre", slug: `autre-${Date.now()}`, theme: "{}" } });
  const p = await db.product.create({ data: { storeId: store.id, title: "Bol", handle: "bol", status: "active", variants: { create: { title: "Par défaut", priceCents: 2000, stock: 5 } } }, include: { variants: true } });
  const q = await db.product.create({ data: { storeId: other.id, title: "Secret", handle: "secret", status: "active", variants: { create: { title: "Par défaut", priceCents: 999, stock: 1 } } }, include: { variants: true } });
  variantId = p.variants[0].id;
  otherVariantId = q.variants[0].id;
});

describe("API publique", () => {
  it("refuse sans clé, avec une fausse clé ou sans le bon droit", async () => {
    expect((await listProducts(call("/api/v1/products", null))).status).toBe(401);
    expect((await listProducts(call("/api/v1/products", "pp_fausse"))).status).toBe(401);
    const ordersOnly = await keyFor(store.id, ["read_orders"]);
    expect((await listProducts(call("/api/v1/products", ordersOnly))).status).toBe(403);
  });

  it("ne montre et ne modifie que les données de sa boutique", async () => {
    const key = await keyFor(store.id, ["read_products", "write_products"]);
    const res = await listProducts(call("/api/v1/products", key));
    const json = await res.json();
    expect(json.data.map((p: { title: string }) => p.title)).toEqual(["Bol"]);
    const foreign = await patchVariant(call(`/api/v1/variants/${otherVariantId}`, key, { method: "PATCH", body: JSON.stringify({ stock: 0 }) }), { params: Promise.resolve({ id: otherVariantId }) });
    expect(foreign.status).toBe(404);
    expect((await db.variant.findUniqueOrThrow({ where: { id: otherVariantId } })).stock).toBe(1);
  });

  it("ajuste le stock sans écraser les ventes simultanées", async () => {
    const key = await keyFor(store.id, ["write_products"]);
    const res = await patchVariant(call(`/api/v1/variants/${variantId}`, key, { method: "PATCH", body: JSON.stringify({ stockAdjustment: -2 }) }), { params: Promise.resolve({ id: variantId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data.stock).toBe(3);
    const bad = await patchVariant(call(`/api/v1/variants/${variantId}`, key, { method: "PATCH", body: JSON.stringify({ priceCents: -5 }) }), { params: Promise.resolve({ id: variantId }) });
    expect(bad.status).toBe(422);
  });
});

describe("webhooks", () => {
  it("n'appelle jamais une adresse du réseau interne", async () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.10", "172.16.0.1", "::1", "::ffff:127.0.0.1", "fd00::1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
    expect(await checkWebhookUrl("http://169.254.169.254/latest/meta-data")).toMatch(/réseau privé/);
    expect(await checkWebhookUrl("https://user:pass@exemple.fr/")).toMatch(/identifiants/);
  });

  it("envoie la commande payée, signée avec la clé du webhook", async () => {
    const received: { topic: string; sig: string; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { received.push({ topic: String(req.headers["x-revolution-topic"]), sig: String(req.headers["x-revolution-hmac-sha256"]), body }); res.end("ok"); });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const hook = await db.webhook.create({ data: { storeId: store.id, url: `http://127.0.0.1:${port}/hook`, topics: JSON.stringify(["orders/paid"]), secret: "whsec_test" } });
    try {
      const cart = await priceCart(store, [{ variantId, quantity: 1 }]);
      const order = await createOrder(store, cart, { email: "a@test.local", name: "Client", address: { line1: "1 rue", zip: "75001", city: "Paris", country: "France" }, note: "" }, "demo");
      await markOrderPaid(order.id);
    } finally {
      server.close();
    }
    expect(received).toHaveLength(1); // seulement l'événement suivi (pas orders/create)
    expect(received[0].topic).toBe("orders/paid");
    expect(received[0].sig).toBe(sign("whsec_test", received[0].body));
    expect(JSON.parse(received[0].body).paymentStatus).toBe("paid");
    expect((await db.webhook.findUniqueOrThrow({ where: { id: hook.id } })).lastStatus).toBe(200);
  });
});
