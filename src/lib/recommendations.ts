import "server-only";
import type { CardProduct } from "@/components/store/types";
import { db } from "./db";
import { getCatalog } from "./storefront";
import { parseJson } from "./utils";

export type Suggestion = CardProduct & { quickVariantId: string | null };

/**
 * Produits complémentaires de ces produits : d'abord ceux choisis par la boutique,
 * puis ceux le plus souvent achetés dans les mêmes commandes (12 derniers mois).
 * Jamais un produit déjà présent, épuisé ou une carte cadeau.
 */
export async function complementaryProducts(storeId: string, productIds: string[], limit = 4): Promise<Suggestion[]> {
  if (!productIds.length) return [];
  const exclude = new Set(productIds);
  const score = new Map<string, number>();

  // 1. Choix de la boutique (forte priorité, dans l'ordre choisi).
  const sources = await db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { complementaryIds: true } });
  for (const s of sources) parseJson<string[]>(s.complementaryIds, []).forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1000 - i));

  // 2. Achats groupés : commandes payées qui contiennent l'un de ces produits.
  const since = new Date(Date.now() - 365 * 86400_000);
  const variantRows = await db.variant.findMany({ where: { product: { storeId } }, select: { id: true, productId: true } });
  const productOf = new Map(variantRows.map((v) => [v.id, v.productId]));
  const orders = await db.order.findMany({
    where: { storeId, paymentStatus: { in: ["paid", "partially_refunded"] }, createdAt: { gte: since } },
    select: { items: { select: { variantId: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  for (const o of orders) {
    const ids = new Set(o.items.map((i) => (i.variantId ? productOf.get(i.variantId) : undefined)).filter((x): x is string => !!x));
    if (![...ids].some((id) => exclude.has(id))) continue;
    for (const id of ids) if (!exclude.has(id)) score.set(id, (score.get(id) ?? 0) + 1);
  }
  if (!score.size) return [];

  const { products } = await getCatalog(storeId);
  const giftCards = new Set((await db.product.findMany({ where: { storeId, isGiftCard: true }, select: { id: true } })).map((p) => p.id));
  const ranked = products
    .filter((p) => score.has(p.id) && !exclude.has(p.id) && !p.soldOut && !giftCards.has(p.id))
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
    .slice(0, limit);

  // Ajout en un clic seulement si le produit n'a qu'une variante disponible à choisir.
  const variants = await db.variant.findMany({ where: { productId: { in: ranked.map((p) => p.id) } }, select: { id: true, productId: true, stock: true } });
  return ranked.map((p) => {
    const vs = variants.filter((v) => v.productId === p.id);
    return { ...p, quickVariantId: vs.length === 1 && (vs[0].stock > 0 || !p.soldOut) ? vs[0].id : null };
  });
}
