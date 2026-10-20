import { NextResponse } from "next/server";
import { apiError, authenticate, orderJson } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOrder } from "@/lib/webhooks";

/** Marque une commande expédiée comme livrée (transporteur, logisticien…). Émet le webhook « orders/delivered ». */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "write_orders");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const o = await db.order.findFirst({ where: { id, storeId: auth.store.id } });
  if (!o) return apiError(404, "not_found", "Commande introuvable.");
  if (o.cancelledAt) return apiError(409, "cancelled", "Cette commande est annulée.");
  if (o.fulfillmentStatus !== "fulfilled") return apiError(409, "not_fulfilled", "Cette commande n'est pas encore expédiée.");
  if (o.deliveredAt) return apiError(409, "already_delivered", "Cette commande est déjà livrée.");
  const r = await db.order.updateMany({ where: { id: o.id, deliveredAt: null }, data: { deliveredAt: new Date() } });
  if (r.count) {
    await db.orderEvent.create({ data: { orderId: o.id, type: "delivered", author: "API" } });
    await emitOrder(o.id, "orders/delivered");
  }
  const updated = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
  return NextResponse.json({ data: orderJson(updated, auth.store) });
}
