import { notFound, redirect } from "next/navigation";
import { submitReturn } from "../../actions";
import { Thumb } from "@/components/ui";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { RETURN_REASONS, returnableItems, returnBlocker, returnDeadline } from "@/lib/returns";
import { getStore } from "@/lib/storefront";
import { dict, intlLocale } from "@/lib/i18n";

const T = dict(
  {
    title: "Retourner des articles",
    account: "← Mon compte",
    order: (n: number) => `Commande #${n}`,
    until: (date: string) => ` · retour possible jusqu'au ${date}`,
    quantity: "Quantité",
    keep: "Garder",
    reason: "Motif",
    choose: "Choisissez un motif",
    reasons: {} as Record<string, string>,
    note: "Précisions (facultatif)",
    placeholder: "Ex. : la couture est décousue sur la manche gauche.",
    info: "Une fois votre retour accepté, vous recevrez par e-mail les instructions pour renvoyer les articles. N'envoyez rien avant.",
    submit: "Envoyer la demande",
  },
  {
    title: "Return items",
    account: "← My account",
    order: (n: number) => `Order #${n}`,
    until: (date: string) => ` · returnable until ${date}`,
    quantity: "Quantity",
    keep: "Keep",
    reason: "Reason",
    choose: "Choose a reason",
    // Libellés affichés ; la valeur envoyée reste le motif français attendu par le serveur.
    reasons: {
      "Taille trop petite": "Too small",
      "Taille trop grande": "Too large",
      "Ne correspond pas à la description": "Not as described",
      "Article défectueux ou abîmé": "Defective or damaged",
      "Mauvais article reçu": "Wrong item received",
      "A changé d'avis": "Changed my mind",
      "Autre": "Other",
    } as Record<string, string>,
    note: "Details (optional)",
    placeholder: "E.g. the seam has come undone on the left sleeve.",
    info: "Once your return is approved, you'll receive instructions by email for sending the items back. Don't send anything before then.",
    submit: "Send request",
  },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function ReturnRequestPage({ params, searchParams }: { params: Promise<{ slug: string; orderId: string }>; searchParams: Promise<{ err?: string }> }) {
  const [{ slug, orderId }, { err }] = await Promise.all([params, searchParams]);
  const { store, locale } = await getStore(slug);
  const t = T[locale];
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const order = await db.order.findFirst({ where: { id: orderId, storeId: store.id, OR: [{ customerId: customer.id }, { email: customer.email }] }, include: { items: true, returns: true } });
  if (!order) notFound();
  const blocker = returnBlocker(store, order);
  const items = returnableItems(order);
  const field = "rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2 outline-none focus:border-[var(--c-text)]";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <a href={`/s/${slug}/account`} className="text-sm underline underline-offset-4">{t.account}</a>
      <div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-[var(--c-muted)]">{t.order(order.number)}{!blocker && t.until(returnDeadline(store, order).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long" }))}</p>
      </div>
      {blocker ? (
        <p className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">{blocker}</p>
      ) : (
        <form action={submitReturn} className="flex flex-col gap-5">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="orderId" value={order.id} />
          {err && <p role="alert" className="rounded-[var(--t-radius)] border border-red-600 px-3 py-2 text-sm text-red-700">{err}</p>}
          <ul className="flex flex-col gap-3">
            {items.map(({ item: i, available }) => (
              <li key={i.id} className="flex flex-col gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4">
                <input type="hidden" name="item" value={i.id} />
                <div className="flex items-center gap-3">
                  <Thumb image={i.image} hue={i.hue} title={i.productTitle} rounded="rounded-[var(--t-radius)]" className="h-14 w-12 text-sm" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{i.productTitle}</div>
                    <div className="text-[var(--c-muted)]">{i.variantTitle !== "Par défaut" ? `${i.variantTitle} · ` : ""}{formatMoney(i.priceCents, store.currency, intlLocale(locale))}</div>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <label className="flex flex-col gap-1 text-sm">{t.quantity}
                    <select name={`qty_${i.id}`} defaultValue={items.length === 1 ? String(available) : "0"} className={field}>
                      {Array.from({ length: available + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? t.keep : n}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">{t.reason}
                    <select name={`reason_${i.id}`} defaultValue="" className={field}>
                      <option value="" disabled>{t.choose}</option>
                      {RETURN_REASONS.map((r) => <option key={r} value={r}>{t.reasons[r] ?? r}</option>)}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1 text-sm">{t.note}
            <textarea name="note" rows={3} maxLength={1000} placeholder={t.placeholder} className={field} />
          </label>
          <p className="text-sm text-[var(--c-muted)]">{t.info}</p>
          <button className="self-start rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)]">{t.submit}</button>
        </form>
      )}
    </div>
  );
}
