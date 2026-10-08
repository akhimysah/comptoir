import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { priceCart } from "@/lib/pricing";

const schema = z.object({
  slug: z.string(),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional().default(""),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number() })).min(1).max(100),
});

/** Mémorise le panier d'un client qui a saisi son e-mail, pour pouvoir le relancer s'il ne commande pas. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const b = parsed.data;
  const store = await db.store.findUnique({ where: { slug: b.slug } });
  if (!store) return NextResponse.json({ ok: false }, { status: 404 });
  const cart = await priceCart(store, b.items);
  if (!cart.lines.length) return NextResponse.json({ ok: false });
  const items = JSON.stringify(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
  const existing = await db.checkout.findUnique({ where: { storeId_email: { storeId: store.id, email: b.email } } });
  if (existing) {
    // Un nouveau panier après une commande repart de zéro.
    await db.checkout.update({
      where: { id: existing.id },
      data: { items, name: b.name || existing.name, totalCents: cart.subtotalCents, activityAt: new Date(), ...(existing.orderId ? { orderId: null, remindedAt: null, recoveredAt: null } : {}) },
    });
  } else {
    await db.checkout.create({ data: { storeId: store.id, email: b.email, name: b.name, items, totalCents: cart.subtotalCents, token: randomBytes(18).toString("base64url") } });
  }
  return NextResponse.json({ ok: true });
}
