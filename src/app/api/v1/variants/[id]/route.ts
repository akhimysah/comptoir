import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticate, invalid, body, variantJson } from "@/lib/api";
import { db } from "@/lib/db";
import { notifyBackInStock } from "@/lib/stock-alerts";
import { logAdjustment } from "@/lib/inventory-log";

const money = z.number().int().min(0).max(100_000_000);
const patch = z.object({
  priceCents: money.optional(),
  compareAtCents: money.nullable().optional(),
  sku: z.string().trim().max(60).optional(),
  stock: z.number().int().min(-100_000).max(1_000_000).optional(),
  /** Variation relative du stock (ex. -2 après une vente ailleurs) : sans risque de perdre une vente simultanée. */
  stockAdjustment: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).optional(),
  barcode: z.string().trim().max(40).optional(),
  /** Taille du produit emballé, en millimètres (null pour effacer). */
  dimensionsMm: z.object({ length: z.number().int().min(0).max(5000).nullable(), width: z.number().int().min(0).max(5000).nullable(), height: z.number().int().min(0).max(5000).nullable() }).nullable().optional(),
}).strict().refine((b) => b.stock === undefined || b.stockAdjustment === undefined, "Utilisez stock ou stockAdjustment, pas les deux.");

/** Prix, SKU, code-barres, poids, dimensions et stock d'une variante (synchronisation avec une caisse, un ERP…). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "write_products");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = patch.safeParse(await body(req));
  if (!parsed.success) return invalid(parsed.error);
  const v = await db.variant.findFirst({ where: { id, product: { storeId: auth.store.id } } });
  if (!v) return apiError(404, "not_found", "Variante introuvable.");
  const { stockAdjustment, dimensionsMm, ...rest } = parsed.data;
  const dims = dimensionsMm === undefined ? {} : { lengthMm: dimensionsMm?.length ?? null, widthMm: dimensionsMm?.width ?? null, heightMm: dimensionsMm?.height ?? null };
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.variant.update({ where: { id }, data: { ...rest, ...dims, ...(stockAdjustment ? { stock: { increment: stockAdjustment } } : {}) } });
    await logAdjustment(tx, { storeId: auth.store.id, variantId: id, delta: u.stock - v.stock, after: u.stock, reason: "API" });
    return u;
  });
  if (updated.stock > 0 && v.stock <= 0) await notifyBackInStock({ storeId: auth.store.id, variantIds: [id] });
  return NextResponse.json({ data: variantJson(updated) });
}
