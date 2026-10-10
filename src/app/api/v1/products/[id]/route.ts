import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticate, invalid, body, productJson } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const auth = await authenticate(req, "read_products");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const p = await db.product.findFirst({ where: { OR: [{ id }, { handle: id }], storeId: auth.store.id }, include: { variants: true } });
  if (!p) return apiError(404, "not_found", "Produit introuvable.");
  return NextResponse.json({ data: productJson(p, auth.store) });
}

const patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20_000).optional(),
  status: z.enum(["active", "draft"]).optional(),
  images: z.array(z.string().url().max(2000)).max(20).optional(),
}).strict();

/** Modifie le titre, la description, le statut ou les photos. Les prix et le stock se modifient par variante. */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate(req, "write_products");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = patch.safeParse(await body(req));
  if (!parsed.success) return invalid(parsed.error);
  const p = await db.product.findFirst({ where: { id, storeId: auth.store.id } });
  if (!p) return apiError(404, "not_found", "Produit introuvable.");
  const { images, ...rest } = parsed.data;
  const updated = await db.product.update({ where: { id }, data: { ...rest, ...(images ? { images: JSON.stringify(images) } : {}) }, include: { variants: true } });
  return NextResponse.json({ data: productJson(updated, auth.store) });
}
