import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { CartView } from "@/components/store/CartView";
import { getStore } from "@/lib/storefront";
import { stripeConfigured } from "@/lib/stripe";

export const metadata = { title: "Panier" };

export default async function CartPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cancelled?: string; recover?: string }> }) {
  const [{ slug }, { cancelled, recover }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const saved = recover ? await db.checkout.findFirst({ where: { token: recover, storeId: store.id, orderId: null } }) : null;
  const customer = await getCustomer(store.id);
  const recovered = saved ? { items: parseJson<{ variantId: string; quantity: number }[]>(saved.items, []), email: saved.email, name: saved.name } : null;
  const demo = !(stripeConfigured() && store.stripeChargesEnabled);
  return <CartView slug={slug} currency={store.currency} cancelled={Boolean(cancelled)} demo={demo} recovered={recovered} customer={customer ? { email: customer.email, name: customer.name } : null} />;
}
