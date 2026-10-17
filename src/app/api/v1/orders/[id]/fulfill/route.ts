import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticate, invalid, body, orderJson } from "@/lib/api";
import { db } from "@/lib/db";
import { canFulfill, fulfillOrder } from "@/lib/orders";
import { ownLocation } from "@/lib/locations";

const input = z.object({
  trackingCarrier: z.string().trim().max(40).optional(),
  trackingNumber: z.string().trim().max(60).optional(),
  trackingUrl: z.string().url().max(500).optional(),
  /** Envoie l'e-mail d'expédition au client (oui par défaut). */
  notify: z.boolean().optional(),
  /** Emplacement d'expédition (identifiant renvoyé par GET /api/v1/locations ; principal par défaut). */
  locationId: z.string().max(40).optional(),
}).strict();

/** Marque la commande comme expédiée, avec le suivi du colis (logiciel d'expédition, logisticien…). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "write_orders");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = input.safeParse((await body(req)) ?? {});
  if (!parsed.success) return invalid(parsed.error);
  const o = await db.order.findFirst({ where: { id, storeId: auth.store.id } });
  if (!o) return apiError(404, "not_found", "Commande introuvable.");
  if (o.fulfillmentStatus === "fulfilled") return apiError(409, "already_fulfilled", "Cette commande est déjà expédiée.");
  if (!canFulfill(o)) return apiError(409, "not_payable", "Cette commande n'est pas payée (ou est annulée) : elle ne peut pas être expédiée.");
  const b = parsed.data;
  const tracking = { trackingCarrier: b.trackingCarrier ?? "", trackingNumber: b.trackingNumber ?? "", trackingUrl: b.trackingUrl ?? "" };
  const location = await ownLocation(auth.store.id, b.locationId);
  if (!location) return apiError(422, "invalid", "locationId : emplacement introuvable.");
  const r = await fulfillOrder(o.id, tracking, "API", tracking.trackingNumber ? `suivi ${tracking.trackingNumber}` : "", b.notify ?? true, location);
  if (r.error) return apiError(409, "insufficient_stock", r.error);
  const updated = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
  return NextResponse.json({ data: orderJson(updated, auth.store) });
}
