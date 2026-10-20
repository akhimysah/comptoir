import "server-only";
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { Customer, Order, OrderItem, Product, Store, Variant } from "@prisma/client";
import { db } from "./db";
import { hit } from "./rate-limit";
import { parseJson } from "./utils";

/** Droits qu'une clé peut recevoir. */
export const SCOPES = {
  read_products: "Lire les produits et le stock",
  write_products: "Modifier les produits, les prix et le stock",
  read_orders: "Lire les commandes",
  write_orders: "Expédier les commandes",
  read_customers: "Lire les clients",
} as const;
export type Scope = keyof typeof SCOPES;
export const isScope = (s: string): s is Scope => s in SCOPES;

/** Requêtes autorisées par clé et par minute. */
export const API_RATE_PER_MINUTE = 120;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Nouvelle clé : renvoyée une seule fois en clair, seule son empreinte est enregistrée. */
export function newApiKey() {
  const key = `pp_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), keyHash: hashKey(key) };
}

export const apiError = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ error: { code, message } }, { status, headers });

/**
 * Vérifie la clé (en-tête « Authorization: Bearer … »), son droit et la limite de requêtes.
 * Renvoie la boutique, ou la réponse d'erreur à renvoyer telle quelle.
 */
export async function authenticate(req: Request, scope: Scope): Promise<{ store: Store } | { response: NextResponse }> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? req.headers.get("x-api-key") ?? "";
  if (!key) return { response: apiError(401, "unauthorized", "Clé d'API manquante : ajoutez l'en-tête « Authorization: Bearer <clé> ».") };
  const row = await db.apiKey.findUnique({ where: { keyHash: hashKey(key) }, include: { store: true } });
  if (!row) return { response: apiError(401, "unauthorized", "Clé d'API invalide ou révoquée.") };
  if (!parseJson<string[]>(row.scopes, []).includes(scope)) return { response: apiError(403, "forbidden", `Cette clé n'a pas le droit « ${scope} ».`) };
  if (!(await hit(`api:${row.id}`, API_RATE_PER_MINUTE, 60_000))) return { response: apiError(429, "rate_limited", `Limite de ${API_RATE_PER_MINUTE} requêtes par minute atteinte.`, { "Retry-After": "60" }) };
  // Date de dernière utilisation, mise à jour au plus une fois par minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { store: row.store };
}

/** Pagination par curseur : ?limit=50 (250 max) et ?after=<id du dernier élément reçu>. */
export function page(url: URL) {
  const limit = Math.max(1, Math.min(250, Math.floor(Number(url.searchParams.get("limit")) || 50)));
  const after = url.searchParams.get("after");
  return { take: limit + 1, ...(after ? { cursor: { id: after }, skip: 1 } : {}), orderBy: { id: "asc" as const }, limit };
}
export function paged<T extends { id: string }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  return { data, next: more ? data[data.length - 1].id : null };
}

/** Erreur de validation lisible : champ concerné et problème. */
export function invalid(e: ZodError) {
  const i = e.issues[0];
  const msg = i.code === "unrecognized_keys" ? `champ inconnu (${i.keys.join(", ")})` : i.message;
  return apiError(422, "invalid", `${i.path.join(".") || "corps"} : ${msg}`);
}

/** Lecture du corps JSON (objet attendu). */
export async function body(req: Request): Promise<Record<string, unknown> | null> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

// --- Représentations publiques (montants en centimes, dates ISO) ---

/** Balises « a, b, c » → ["a", "b", "c"] (et retour), sans doublon ni vide. */
export const splitTags = (tags: string) => [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))];
export const joinTags = (tags: string[]) => splitTags(tags.join(",")).join(", ");

export const variantJson = (v: Variant) => ({
  id: v.id, title: v.title, options: parseJson<string[]>(v.optionValues, []), sku: v.sku, barcode: v.barcode,
  priceCents: v.priceCents, compareAtCents: v.compareAtCents, stock: v.stock, weightGrams: v.weightGrams, image: v.image,
  // Taille du produit emballé, en millimètres (null si inconnue).
  dimensionsMm: v.lengthMm || v.widthMm || v.heightMm ? { length: v.lengthMm, width: v.widthMm, height: v.heightMm } : null,
});

export const productJson = (p: Product & { variants: Variant[] }, store: Store) => ({
  id: p.id, handle: p.handle, title: p.title, description: p.description, status: p.status,
  vendor: p.vendor, productType: p.productType, category: p.category, tags: splitTags(p.tags), taxable: p.taxable,
  images: parseJson<string[]>(p.images, []), options: parseJson<{ name: string; values: string[] }[]>(p.options, []),
  currency: store.currency, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  variants: [...p.variants].sort((a, b) => a.position - b.position).map(variantJson),
});

export const orderJson = (o: Order & { items: OrderItem[] }, store: Store) => ({
  id: o.id, number: o.number, email: o.email, name: o.name, currency: store.currency,
  createdAt: o.createdAt.toISOString(), paidAt: o.paidAt?.toISOString() ?? null, cancelledAt: o.cancelledAt?.toISOString() ?? null, dueAt: o.dueAt?.toISOString() ?? null,
  paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus, deliveryMethod: o.deliveryMethod,
  deliveredAt: o.deliveredAt?.toISOString() ?? null, fulfillBy: o.fulfillBy?.toISOString() ?? null, archivedAt: o.archivedAt?.toISOString() ?? null,
  tags: o.tags.split(",").map((t) => t.trim()).filter(Boolean), riskLevel: o.riskLevel || null,
  shippingAddress: parseJson(o.address, null), note: o.note,
  subtotalCents: o.subtotalCents, discountCents: o.discountCents, discountCode: o.discountCode, shippingCents: o.shippingCents, shippingMethod: o.shippingMethod,
  taxCents: o.taxCents, taxRateBps: o.taxRateBps, giftCardCents: o.giftCardCents, totalCents: o.totalCents, refundedCents: o.refundedCents,
  tracking: o.trackingNumber ? { carrier: o.trackingCarrier, number: o.trackingNumber, url: o.trackingUrl } : null,
  items: o.items.map((i) => ({ id: i.id, variantId: i.variantId, title: i.productTitle, variantTitle: i.variantTitle, quantity: i.quantity, priceCents: i.priceCents, refundedQuantity: i.refundedQuantity })),
});

export const customerJson = (c: Customer) => ({
  id: c.id, email: c.email, name: c.name, phone: c.phone, company: c.company, vatNumber: c.vatNumber,
  tags: c.tags.split(",").map((t) => t.trim()).filter(Boolean), acceptsMarketing: c.acceptsMarketing, points: c.points,
  address: parseJson(c.address, null), createdAt: c.createdAt.toISOString(),
});
