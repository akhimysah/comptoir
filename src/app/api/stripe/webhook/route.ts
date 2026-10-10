import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cancelUnpaidOrder, markOrderPaid } from "@/lib/orders";
import { renewSubscription } from "@/lib/renewals";
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
      if (session.payment_status === "paid" && session.metadata?.orderId) {
        const orderId = session.metadata.orderId;
        // On garde la référence du paiement pour pouvoir rembourser (en mode abonnement, elle est sur la facture).
        let pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
        if (!pi && session.invoice) {
          const inv = await stripe.invoices.retrieve(typeof session.invoice === "string" ? session.invoice : session.invoice.id);
          pi = typeof inv.payment_intent === "string" ? inv.payment_intent : inv.payment_intent?.id ?? null;
        }
        // Facture payée par carte : la commande devient une commande Stripe (remboursable sur la carte).
        await db.order.updateMany({ where: { id: orderId }, data: { ...(pi ? { stripePaymentIntentId: pi } : {}), ...(session.metadata.invoice ? { paymentMethod: "stripe", stripeSessionId: session.id } : {}) } });
        await markOrderPaid(orderId);
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) await db.subscription.updateMany({ where: { firstOrderId: orderId }, data: { stripeSubscriptionId: subId } });
      }
      break;
    }
    case "checkout.session.expired": {
      // Paiement abandonné : la commande est annulée et la carte cadeau / le code promo réservés sont rendus.
      const session = event.data.object;
      // Une facture envoyée par la boutique reste payable : le client peut rouvrir le lien.
      if (session.metadata?.orderId && !session.metadata.invoice) await cancelUnpaidOrder(session.metadata.orderId, "Stripe");
      break;
    }
    case "invoice.paid": {
      // Échéance d'abonnement prélevée par Stripe : on crée la commande à préparer.
      const invoice = event.data.object;
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (subId && invoice.billing_reason === "subscription_cycle") {
        const subs = await db.subscription.findMany({ where: { stripeSubscriptionId: subId } });
        const pi = typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id ?? null;
        // Une facture Stripe = une commande, même si Stripe renvoie l'événement plusieurs fois.
        if (subs[0]) await renewSubscription(subs[0].storeId, subs[0].id, { invoiceId: invoice.id!, amountPaidCents: invoice.amount_paid, paymentIntentId: pi });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await db.subscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status: "cancelled" } });
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
