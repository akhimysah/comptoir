import { displayCurrency } from "@/lib/currency";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { CartView } from "@/components/store/CartView";
import { CHARGEABLE_CURRENCIES } from "@/lib/presentment";
import { getStore } from "@/lib/storefront";
import { stripeConfigured } from "@/lib/stripe";
import { dict } from "@/lib/i18n";

const T = dict({ title: "Panier" }, { title: "Cart" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function CartPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cancelled?: string; recover?: string }> }) {
  const [{ slug }, { cancelled, recover }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const saved = recover ? await db.checkout.findFirst({ where: { token: recover, storeId: store.id, orderId: null } }) : null;
  const customer = await getCustomer(store.id);
  const recovered = saved ? { items: parseJson<{ variantId: string; quantity: number }[]>(saved.items, []), email: saved.email, name: saved.name, token: saved.token } : null;
  const cur = await displayCurrency(store);
  const demo = !(stripeConfigured() && store.stripeChargesEnabled);
  return <CartView slug={slug} currency={store.currency} display={cur} chargeDisplay={store.chargeInCustomerCurrency && CHARGEABLE_CURRENCIES.has(cur.code)} loyalty={store.loyaltyEnabled ? { perUnit: store.loyaltyPointsPerUnit } : null} cancelled={Boolean(cancelled)} demo={demo} recovered={recovered} customer={customer ? { email: customer.email, name: customer.name } : null} />;
}
