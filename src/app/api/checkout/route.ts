import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOrder, markOrderPaid } from "@/lib/orders";
import { priceCart } from "@/lib/pricing";
import { appUrl, getStripe, platformFee } from "@/lib/stripe";

const schema = z.object({
  slug: z.string(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number() })).min(1).max(100),
  code: z.string().max(30).optional().default(""),
  email: z.string().trim().email("Indiquez une adresse e-mail valide."),
  name: z.string().trim().min(2, "Indiquez votre nom complet.").max(80),
  line1: z.string().trim().min(3, "Indiquez votre adresse.").max(140),
  zip: z.string().trim().min(2, "Indiquez votre code postal.").max(12),
  city: z.string().trim().min(1, "Indiquez votre ville.").max(60),
  country: z.string().trim().min(2).max(60),
  note: z.string().max(500).optional().default(""),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;

  const store = await db.store.findUnique({ where: { slug: b.slug } });
  if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });

  const cart = await priceCart(store, b.items, b.code);
  if (!cart.lines.length) return NextResponse.json({ error: "Votre panier est vide." }, { status: 400 });
  if (b.code && cart.discountError) return NextResponse.json({ error: cart.discountError }, { status: 400 });
  if (cart.notices.length) return NextResponse.json({ error: cart.notices[0], refresh: true }, { status: 409 });

  const stripe = getStripe();
  const useStripe = Boolean(stripe && store.stripeAccountId && store.stripeChargesEnabled);
  const order = await createOrder(
    store,
    cart,
    { email: b.email, name: b.name, address: { line1: b.line1, zip: b.zip, city: b.city, country: b.country }, note: b.note },
    useStripe ? "stripe" : "demo",
  );
  const thanks = `${appUrl()}/s/${store.slug}/order/${order.id}`;

  if (!useStripe || !stripe) {
    await markOrderPaid(order.id);
    return NextResponse.json({ url: thanks });
  }

  const currency = store.currency.toLowerCase();
  const coupon = cart.discountCents > 0 ? await stripe.coupons.create({ amount_off: cart.discountCents, currency, duration: "once", name: cart.discountCode ?? "Réduction" }) : null;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: b.email,
    locale: "fr",
    line_items: [
      ...cart.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency,
          unit_amount: l.priceCents,
          product_data: { name: l.variantTitle === "Par défaut" ? l.productTitle : `${l.productTitle} — ${l.variantTitle}` },
        },
      })),
      ...(cart.shippingCents ? [{ quantity: 1, price_data: { currency, unit_amount: cart.shippingCents, product_data: { name: "Livraison" } } }] : []),
    ],
    ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
    payment_intent_data: {
      application_fee_amount: platformFee(cart.totalCents),
      transfer_data: { destination: store.stripeAccountId! },
      metadata: { orderId: order.id, storeId: store.id },
    },
    metadata: { orderId: order.id, storeId: store.id },
    success_url: `${thanks}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/s/${store.slug}/cart?cancelled=1`,
  });
  await db.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
  return NextResponse.json({ url: session.url });
}
