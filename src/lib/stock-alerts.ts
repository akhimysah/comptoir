import "server-only";
import { db } from "./db";
import { backInStockEmail } from "./emails";
import { sendMail } from "./mail";
import { appUrl } from "./stripe";
import { parseJson } from "./utils";

/** Enregistre une demande « Me prévenir » pour une variante épuisée de la boutique. */
export async function addStockAlert(storeId: string, variantId: string, email: string): Promise<{ error?: string }> {
  const v = await db.variant.findFirst({ where: { id: variantId, product: { storeId, status: "active", isGiftCard: false } }, select: { id: true, stock: true } });
  if (!v) return { error: "Article introuvable." };
  if (v.stock > 0) return { error: "Cet article est de nouveau disponible : vous pouvez le commander." };
  // Une nouvelle demande après une alerte déjà envoyée repart de zéro.
  await db.stockAlert.upsert({ where: { variantId_email: { variantId, email } }, update: { notifiedAt: null, createdAt: new Date() }, create: { storeId, variantId, email } });
  return {};
}

/**
 * Prévient les clients en attente quand leur article est de nouveau en stock.
 * À appeler après tout réapprovisionnement ; sans liste, vérifie toute la boutique (ou toutes les boutiques).
 * Chaque alerte n'est envoyée qu'une fois, même si deux réapprovisionnements arrivent en même temps.
 */
export async function notifyBackInStock(opts: { storeId?: string; variantIds?: string[] } = {}) {
  const alerts = await db.stockAlert.findMany({
    where: { notifiedAt: null, ...(opts.storeId ? { storeId: opts.storeId } : {}), ...(opts.variantIds ? { variantId: { in: opts.variantIds } } : {}) },
    take: 500,
  });
  if (!alerts.length) return 0;
  const variants = await db.variant.findMany({ where: { id: { in: [...new Set(alerts.map((a) => a.variantId))] }, stock: { gt: 0 }, product: { status: "active" } }, include: { product: { include: { store: true } } } });
  let sent = 0;
  for (const a of alerts) {
    const v = variants.find((x) => x.id === a.variantId);
    if (!v || v.product.storeId !== a.storeId) continue;
    const claimed = await db.stockAlert.updateMany({ where: { id: a.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
    if (!claimed.count) continue;
    const store = v.product.store;
    const url = `${appUrl()}/s/${store.slug}/p/${v.product.handle}?variant=${v.id}`;
    await sendMail({ to: a.email, storeId: store.id, ...backInStockEmail(store, { title: v.product.title, image: parseJson<string[]>(v.product.images, [])[0] ?? null }, v.title, url, v.priceCents) });
    sent++;
  }
  return sent;
}

/** Demandes en attente par variante (pour l'admin). */
export async function pendingAlertsByVariant(storeId: string) {
  const rows = await db.stockAlert.groupBy({ by: ["variantId"], where: { storeId, notifiedAt: null }, _count: true });
  return new Map(rows.map((r) => [r.variantId, r._count]));
}
