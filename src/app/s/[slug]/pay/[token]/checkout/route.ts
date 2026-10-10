import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoicePayable } from "@/lib/invoices";
import { markOrderPaid } from "@/lib/orders";
import { appUrl, demoPaymentsAllowed, getStripe } from "@/lib/stripe";
import { storePlatformFee } from "@/lib/billing";
import { storeBaseBySlug } from "@/lib/domains";

/** Paiement d'une facture : carte via Stripe, ou paiement de démonstration en local. */
export async function POST(_: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const base = await storeBaseBySlug(slug);
  const page = `${base}/pay/${token}`;
  const order = await db.order.findFirst({ where: { payToken: token, store: { slug } }, include: { store: true } });
  if (!order) return NextResponse.redirect(page, 303);
  const thanks = `${base}/order/${order.id}`;
  if (!invoicePayable(order)) return NextResponse.redirect(order.paymentStatus === "pending" ? page : thanks, 303);

  const store = order.store;
  const stripe = getStripe();
  if (stripe && store.stripeAccountId && store.stripeChargesEnabled) {
    if (order.totalCents < 50) return NextResponse.redirect(`${page}?err=min`, 303);
    // Une seule session ouverte à la fois : la précédente est fermée pour éviter un double paiement.
    if (order.stripeSessionId) {
      const prev = await stripe.checkout.sessions.retrieve(order.stripeSessionId).catch(() => null);
      if (prev?.payment_status === "paid") return NextResponse.redirect(`${thanks}?session_id=${prev.id}`, 303);
      if (prev?.status === "open") await stripe.checkout.sessions.expire(prev.id).catch(() => null);
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: order.email,
      locale: order.locale === "en" ? "en" : "fr",
      line_items: [{ quantity: 1, price_data: { currency: store.currency.toLowerCase(), unit_amount: order.totalCents, product_data: { name: `${order.locale === "en" ? "Order" : "Commande"} #${order.number} · ${store.name}` } } }],
      payment_intent_data: { application_fee_amount: storePlatformFee(store, order.totalCents), transfer_data: { destination: store.stripeAccountId }, metadata: { orderId: order.id, storeId: store.id } },
      // « invoice » : une facture abandonnée sur Stripe n'est pas annulée, le client peut réessayer.
      metadata: { orderId: order.id, storeId: store.id, invoice: "1" },
      success_url: `${thanks}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: page,
    });
    await db.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return NextResponse.redirect(session.url!, 303);
  }
  if (!demoPaymentsAllowed()) return NextResponse.redirect(`${page}?err=off`, 303);
  const claimed = await db.order.updateMany({ where: { id: order.id, paymentStatus: "pending", cancelledAt: null }, data: { paymentMethod: "demo" } });
  if (claimed.count) await markOrderPaid(order.id);
  return NextResponse.redirect(thanks, 303);
}
