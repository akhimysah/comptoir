import { db } from "@/lib/db";
import { getStore } from "@/lib/storefront";

export const metadata = { title: "Désabonnement", robots: { index: false } };

export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ slug }, { t }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const c = t ? await db.customer.findFirst({ where: { storeId: store.id, marketingToken: t } }) : null;
  if (c?.acceptsMarketing) await db.customer.update({ where: { id: c.id }, data: { acceptsMarketing: false } });
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-24 text-center">
      <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{c ? "Vous êtes désabonné" : "Lien invalide"}</h1>
      <p className="text-[var(--c-muted)]">{c ? `${c.email} ne recevra plus la newsletter de ${store.name}. Vous continuerez à recevoir les e-mails liés à vos commandes.` : "Ce lien de désabonnement n'est pas reconnu."}</p>
      <a href={`/s/${slug}`} className="mx-auto mt-2 rounded-[var(--t-radius)] border border-[var(--c-text)] px-6 py-3 font-semibold">Retour à la boutique</a>
    </div>
  );
}
