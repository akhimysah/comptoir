import { redirect } from "next/navigation";
import { CustomerLogin } from "./LoginForm";
import { getCustomer } from "@/lib/customer-auth";
import { getStore } from "@/lib/storefront";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store } = await getStore(slug);
  if (await getCustomer(store.id)) redirect(`/s/${slug}/account`);
  return <CustomerLogin slug={slug} storeName={store.name} />;
}
