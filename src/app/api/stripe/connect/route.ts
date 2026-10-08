import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, getStripe } from "@/lib/stripe";

/** Crée (si besoin) le compte Stripe Express du marchand et l'envoie vers l'inscription ou son tableau de bord. */
export async function GET() {
  const { user, store } = await requireOwner();
  const stripe = getStripe();
  const back = `${appUrl()}/admin/settings`;
  if (!stripe) return NextResponse.redirect(`${back}?stripe=config`);

  try {
    let accountId = store.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        business_profile: { name: store.name, url: `${appUrl()}/s/${store.slug}` },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { storeId: store.id },
      });
      accountId = account.id;
      await db.store.update({ where: { id: store.id }, data: { stripeAccountId: accountId } });
    }

    if (store.stripeChargesEnabled) {
      const login = await stripe.accounts.createLoginLink(accountId);
      return NextResponse.redirect(login.url);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${appUrl()}/api/stripe/connect`,
      return_url: `${appUrl()}/api/stripe/connect/return`,
    });
    return NextResponse.redirect(link.url);
  } catch (e) {
    console.error("Stripe Connect", e);
    return NextResponse.redirect(`${back}?stripe=stripe`);
  }
}
