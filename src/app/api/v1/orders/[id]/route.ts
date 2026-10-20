import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticate, body, invalid, orderJson } from "@/lib/api";
import { db } from "@/lib/db";
import { splitOrderTags } from "@/components/admin/OrderSummary";

/** Une commande, par identifiant ou par numéro (ex. 1042). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "read_orders");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const n = /^\d+$/.test(id) ? Number(id) : null;
  const o = await db.order.findFirst({ where: { storeId: auth.store.id, ...(n ? { number: n } : { id }) }, include: { items: true } });
  if (!o) return apiError(404, "not_found", "Commande introuvable.");
  return NextResponse.json({ data: orderJson(o, auth.store) });
}

const patchInput = z.object({
  /** Balises de la commande (remplace la liste ; 20 au plus, 30 caractères chacune). */
  tags: z.array(z.string().trim().max(30)).max(20),
}).strict();

/** Modifie les balises d'une commande. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "write_orders");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = patchInput.safeParse((await body(req)) ?? {});
  if (!parsed.success) return invalid(parsed.error);
  const o = await db.order.findFirst({ where: { id, storeId: auth.store.id } });
  if (!o) return apiError(404, "not_found", "Commande introuvable.");
  const tags = splitOrderTags(parsed.data.tags.join(","));
  await db.order.update({ where: { id: o.id }, data: { tags: tags.join(", ") } });
  await db.orderEvent.create({ data: { orderId: o.id, type: "tags_updated", author: "API", message: tags.length ? tags.join(", ") : "balises retirées" } });
  const updated = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
  return NextResponse.json({ data: orderJson(updated, auth.store) });
}
