import { db } from "@/lib/db";
import { dict } from "@/lib/i18n";
import { getStore } from "@/lib/storefront";

const T = dict(
  {
    title: "Désabonnement",
    done: "Vous êtes désabonné",
    invalid: "Lien invalide",
    doneText: (email: string, store: string) => `${email} ne recevra plus la newsletter de ${store}. Vous continuerez à recevoir les e-mails liés à vos commandes.`,
    invalidText: "Ce lien de désabonnement n'est pas reconnu.",
    back: "Retour à la boutique",
  },
  {
    title: "Unsubscribe",
    done: "You're unsubscribed",
    invalid: "Invalid link",
    doneText: (email: string, store: string) => `${email} will no longer receive the ${store} newsletter. You'll still receive emails about your orders.`,
    invalidText: "This unsubscribe link isn't recognised.",
    back: "Back to store",
  },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title, robots: { index: false } };
}

export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ slug }, { t }] = await Promise.all([params, searchParams]);
  const { store, locale } = await getStore(slug);
  const tr = T[locale];
  const c = t ? await db.customer.findFirst({ where: { storeId: store.id, marketingToken: t } }) : null;
  if (c?.acceptsMarketing) await db.customer.update({ where: { id: c.id }, data: { acceptsMarketing: false } });
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-24 text-center">
      <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{c ? tr.done : tr.invalid}</h1>
      <p className="text-[var(--c-muted)]">{c ? tr.doneText(c.email, store.name) : tr.invalidText}</p>
      <a href={`/s/${slug}`} className="mx-auto mt-2 rounded-[var(--t-radius)] border border-[var(--c-text)] px-6 py-3 font-semibold">{tr.back}</a>
    </div>
  );
}
