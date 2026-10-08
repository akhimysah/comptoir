import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, getStripe } from "@/lib/stripe";

export async function GET() {
  const { store } = await requireOwner();
  const stripe = getStripe();
  if (stripe && store.stripeAccountId) {
    const account = await stripe.accounts.retrieve(store.stripeAccountId);
    await db.store.update({ where: { id: store.id }, data: { stripeChargesEnabled: Boolean(account.charges_enabled) } });
  }
  return NextResponse.redirect(`${appUrl()}/admin/settings?stripe=done#paiements`);
}
