"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { billingEnabled, isPlanKey, PLANS } from "@/lib/billing";
import { db } from "@/lib/db";
import { appUrl, getStripe } from "@/lib/stripe";

const page = `/admin/settings/plan`;

/** Choix d'un forfait : paiement de l'abonnement sur Stripe Checkout (carte enregistrée pour les mois suivants). */
export async function choosePlan(form: FormData) {
  const { user, store } = await requireOwner();
  const key = String(form.get("plan"));
  const stripe = getStripe();
  if (!isPlanKey(key) || !stripe || !billingEnabled()) redirect(`${page}?err=off`);
  if (store.plan === key && store.planStatus === "active") redirect(page);
  const plan = PLANS[key];
  let customer = store.billingCustomerId;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, name: store.legalName || store.name, metadata: { storeId: store.id } })).id;
    await db.store.update({ where: { id: store.id }, data: { billingCustomerId: customer } });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    locale: "fr",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: plan.priceCents, recurring: { interval: "month" }, product_data: { name: `Revolution Ecom · forfait ${plan.name}` } } }],
    // « kind: plan » distingue ces abonnements de ceux que les clients des boutiques souscrivent.
    subscription_data: { metadata: { kind: "plan", storeId: store.id, plan: key } },
    metadata: { kind: "plan", storeId: store.id, plan: key },
    success_url: `${appUrl()}${page}?ok=1`,
    cancel_url: `${appUrl()}${page}`,
  });
  redirect(session.url!);
}

/** Portail de facturation Stripe : carte bancaire, factures, résiliation. */
export async function openBillingPortal() {
  const { store } = await requireOwner();
  const stripe = getStripe();
  if (!stripe || !store.billingCustomerId) redirect(`${page}?err=off`);
  const portal = await stripe.billingPortal.sessions.create({ customer: store.billingCustomerId!, return_url: `${appUrl()}${page}`, locale: "fr" });
  redirect(portal.url);
}
