import { notFoundOrRedirect } from "@/lib/navigation";
import { getStore } from "@/lib/storefront";

/** Toute adresse inconnue de la boutique : redirection si elle a été enregistrée, sinon page introuvable. */
export default async function UnknownPath({ params }: { params: Promise<{ slug: string; rest: string[] }> }) {
  const { slug, rest } = await params;
  const { store } = await getStore(slug);
  return notFoundOrRedirect(store, `/${rest.join("/")}`);
}
