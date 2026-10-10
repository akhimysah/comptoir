import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authenticate, orderJson, page, paged } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Liste des commandes. Filtres : ?paymentStatus=pending|paid|refunded|partially_refunded,
 * ?fulfillmentStatus=unfulfilled|fulfilled, ?createdAfter=2026-01-01, ?cancelled=true|false.
 */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read_orders");
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const { limit, ...p } = page(url);
  const sp = url.searchParams;
  const where: Prisma.OrderWhereInput = { storeId: auth.store.id };
  const pay = sp.get("paymentStatus");
  if (pay && ["pending", "paid", "refunded", "partially_refunded"].includes(pay)) where.paymentStatus = pay;
  const ful = sp.get("fulfillmentStatus");
  if (ful === "unfulfilled" || ful === "fulfilled") where.fulfillmentStatus = ful;
  const after = sp.get("createdAfter") ? new Date(sp.get("createdAfter")!) : null;
  if (after && !Number.isNaN(after.getTime())) where.createdAt = { gte: after };
  if (sp.get("cancelled") === "true") where.cancelledAt = { not: null };
  if (sp.get("cancelled") === "false") where.cancelledAt = null;
  const rows = await db.order.findMany({ where, include: { items: true }, ...p });
  const { data, next } = paged(rows, limit);
  return NextResponse.json({ data: data.map((o) => orderJson(o, auth.store)), next });
}
