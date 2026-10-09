import "server-only";
import { db } from "./db";

/** Variantes qu'on peut mettre dans un lot : produits de la boutique, hors lots, cartes cadeaux et le produit lui-même. */
export async function bundleChoicesFor(storeId: string, exceptProductId?: string) {
  const variants = await db.variant.findMany({
    where: { product: { storeId, isGiftCard: false, bundleItems: { none: {} }, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) } },
    include: { product: true },
    orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
  });
  return variants.map((v) => ({ id: v.id, label: v.title === "Par défaut" ? v.product.title : `${v.product.title} · ${v.title}`, stock: v.stock }));
}
