import "server-only";
import { db } from "./db";

type Tx = Pick<typeof db, "bundleItem" | "variant">;

/** Composants des lots parmi ces produits : { bundleId → [{ variantId, quantity, stock }] }. */
export async function bundleComponents(productIds: string[], client: Tx = db) {
  const items = await client.bundleItem.findMany({ where: { bundleId: { in: productIds } } });
  const variants = items.length ? await client.variant.findMany({ where: { id: { in: items.map((i) => i.variantId) } }, select: { id: true, stock: true } }) : [];
  const map = new Map<string, { variantId: string; quantity: number; stock: number }[]>();
  for (const i of items) {
    const stock = variants.find((v) => v.id === i.variantId)?.stock ?? 0;
    map.set(i.bundleId, [...(map.get(i.bundleId) ?? []), { variantId: i.variantId, quantity: i.quantity, stock }]);
  }
  return map;
}

/** Stock d'un lot : combien de lots complets on peut former avec le stock des composants. */
export const bundleStock = (parts: { quantity: number; stock: number }[]) =>
  parts.length ? Math.max(0, Math.min(...parts.map((p) => Math.floor(p.stock / Math.max(1, p.quantity))))) : 0;
