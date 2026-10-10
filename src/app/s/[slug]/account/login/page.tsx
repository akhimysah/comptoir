import { redirect } from "next/navigation";
import { CustomerLogin } from "./LoginForm";
import { getCustomer } from "@/lib/customer-auth";
import { dict } from "@/lib/i18n";
import { getStore } from "@/lib/storefront";

const T = dict({ title: "Connexion" }, { title: "Sign in" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function LoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store } = await getStore(slug);
  if (await getCustomer(store.id)) redirect(`/s/${slug}/account`);
  return <CustomerLogin slug={slug} storeName={store.name} />;
}
