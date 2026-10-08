import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { markOrderPaid } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";

/**
 * Événements Stripe. En local : stripe listen --forward-to localhost:3000/api/stripe/webhook
 * (la page de confirmation vérifie aussi le paiement, le webhook n'est donc pas obligatoire en développement).
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Webhook non configuré" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status === "paid" && session.metadata?.orderId) await markOrderPaid(session.metadata.orderId);
      break;
    }
    case "account.updated": {
      const account = event.data.object;
      await db.store.updateMany({ where: { stripeAccountId: account.id }, data: { stripeChargesEnabled: Boolean(account.charges_enabled) } });
      break;
    }
  }
  return NextResponse.json({ received: true });
}
