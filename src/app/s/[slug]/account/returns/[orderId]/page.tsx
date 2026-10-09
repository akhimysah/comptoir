import { notFound, redirect } from "next/navigation";
import { submitReturn } from "../../actions";
import { Thumb } from "@/components/ui";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { RETURN_REASONS, returnableItems, returnBlocker, returnDeadline } from "@/lib/returns";
import { getStore } from "@/lib/storefront";

export const metadata = { title: "Retourner des articles" };

export default async function ReturnRequestPage({ params, searchParams }: { params: Promise<{ slug: string; orderId: string }>; searchParams: Promise<{ err?: string }> }) {
  const [{ slug, orderId }, { err }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const order = await db.order.findFirst({ where: { id: orderId, storeId: store.id, OR: [{ customerId: customer.id }, { email: customer.email }] }, include: { items: true, returns: true } });
  if (!order) notFound();
  const blocker = returnBlocker(store, order);
  const items = returnableItems(order);
  const field = "rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2 outline-none focus:border-[var(--c-text)]";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <a href={`/s/${slug}/account`} className="text-sm underline underline-offset-4">← Mon compte</a>
      <div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">Retourner des articles</h1>
        <p className="mt-1 text-[var(--c-muted)]">Commande #{order.number}{!blocker && ` · retour possible jusqu'au ${returnDeadline(store, order).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`}</p>
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
                    <div className="text-[var(--c-muted)]">{i.variantTitle !== "Par défaut" ? `${i.variantTitle} · ` : ""}{formatMoney(i.priceCents, store.currency)}</div>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <label className="flex flex-col gap-1 text-sm">Quantité
                    <select name={`qty_${i.id}`} defaultValue={items.length === 1 ? String(available) : "0"} className={field}>
                      {Array.from({ length: available + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "Garder" : n}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">Motif
                    <select name={`reason_${i.id}`} defaultValue="" className={field}>
                      <option value="" disabled>Choisissez un motif</option>
                      {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1 text-sm">Précisions (facultatif)
            <textarea name="note" rows={3} maxLength={1000} placeholder="Ex. : la couture est décousue sur la manche gauche." className={field} />
          </label>
          <p className="text-sm text-[var(--c-muted)]">Une fois votre retour accepté, vous recevrez par e-mail les instructions pour renvoyer les articles. N'envoyez rien avant.</p>
          <button className="self-start rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)]">Envoyer la demande</button>
        </form>
      )}
    </div>
  );
}
