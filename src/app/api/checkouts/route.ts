import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { priceCart } from "@/lib/pricing";
import { getLocale } from "@/lib/locale";

const schema = z.object({
  slug: z.string(),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional().default(""),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number() })).min(1).max(100),
  token: z.string().max(60).optional().nullable(),
});

/** Mémorise le panier d'un client qui a saisi son e-mail, pour pouvoir le relancer s'il ne commande pas. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const b = parsed.data;
  const store = await db.store.findUnique({ where: { slug: b.slug } });
  if (!store) return NextResponse.json({ ok: false }, { status: 404 });
  const cart = await priceCart(store, b.items);
  const locale = await getLocale(store);
  if (!cart.lines.length) return NextResponse.json({ ok: false });
  const items = JSON.stringify(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
  const existing = await db.checkout.findUnique({ where: { storeId_email: { storeId: store.id, email: b.email } } });
  if (existing && !existing.orderId) {
    // Seul le navigateur qui a créé ce panier peut le modifier : sinon n'importe qui pourrait remplacer
    // le panier d'une autre adresse (et donc le contenu de la relance qu'elle recevra).
    if (b.token !== existing.token) return NextResponse.json({ ok: true });
    await db.checkout.update({ where: { id: existing.id }, data: { items, name: b.name || existing.name, totalCents: cart.subtotalCents, activityAt: new Date(), locale } });
    return NextResponse.json({ ok: true, token: existing.token });
  }
  // Nouveau panier, ou nouveau panier après une commande : il repart de zéro avec un nouveau jeton.
  const token = randomBytes(18).toString("base64url");
  const data = { items, name: b.name, totalCents: cart.subtotalCents, token, activityAt: new Date(), orderId: null, remindedAt: null, recoveredAt: null, locale };
  if (existing) await db.checkout.update({ where: { id: existing.id }, data });
  else await db.checkout.create({ data: { storeId: store.id, email: b.email, ...data } });
  return NextResponse.json({ ok: true, token });
}
