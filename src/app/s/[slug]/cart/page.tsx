import { CartView } from "@/components/store/CartView";
import { getStore } from "@/lib/storefront";
import { stripeConfigured } from "@/lib/stripe";

export const metadata = { title: "Panier" };

export default async function CartPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const [{ slug }, { cancelled }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const demo = !(stripeConfigured() && store.stripeChargesEnabled);
  return <CartView slug={slug} currency={store.currency} cancelled={Boolean(cancelled)} demo={demo} />;
}
