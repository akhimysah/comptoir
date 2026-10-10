import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticate, invalid, body, variantJson } from "@/lib/api";
import { db } from "@/lib/db";
import { notifyBackInStock } from "@/lib/stock-alerts";

const money = z.number().int().min(0).max(100_000_000);
const patch = z.object({
  priceCents: money.optional(),
  compareAtCents: money.nullable().optional(),
  sku: z.string().trim().max(60).optional(),
  stock: z.number().int().min(-100_000).max(1_000_000).optional(),
  /** Variation relative du stock (ex. -2 après une vente ailleurs) : sans risque de perdre une vente simultanée. */
  stockAdjustment: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).optional(),
}).strict().refine((b) => b.stock === undefined || b.stockAdjustment === undefined, "Utilisez stock ou stockAdjustment, pas les deux.");

/** Prix, SKU, poids et stock d'une variante (synchronisation avec une caisse, un ERP…). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "write_products");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = patch.safeParse(await body(req));
  if (!parsed.success) return invalid(parsed.error);
  const v = await db.variant.findFirst({ where: { id, product: { storeId: auth.store.id } } });
  if (!v) return apiError(404, "not_found", "Variante introuvable.");
  const { stockAdjustment, ...rest } = parsed.data;
  const updated = await db.variant.update({ where: { id }, data: { ...rest, ...(stockAdjustment ? { stock: { increment: stockAdjustment } } : {}) } });
  if (updated.stock > 0 && v.stock <= 0) await notifyBackInStock({ storeId: auth.store.id, variantIds: [id] });
  return NextResponse.json({ data: variantJson(updated) });
}
