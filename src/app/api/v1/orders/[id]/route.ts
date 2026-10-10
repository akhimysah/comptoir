import { NextResponse } from "next/server";
import { apiError, authenticate, orderJson } from "@/lib/api";
import { db } from "@/lib/db";

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
