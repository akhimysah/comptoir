import { redirect } from "next/navigation";
import { logout, updateName } from "./actions";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getStore } from "@/lib/storefront";

export const metadata = { title: "Mon compte" };

const STATUS = (o: { cancelledAt: Date | null; paymentStatus: string; fulfillmentStatus: string }) =>
  o.cancelledAt ? "Annulée" : o.paymentStatus === "refunded" ? "Remboursée" : o.paymentStatus === "pending" ? "Paiement en attente" : o.fulfillmentStatus === "fulfilled" ? "Expédiée" : "En préparation";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ slug }, { saved }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const orders = await db.order.findMany({ where: { storeId: store.id, OR: [{ customerId: customer.id }, { email: customer.email }] }, include: { items: true }, orderBy: { createdAt: "desc" } });
  const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">Bonjour {customer.name}</h1>
          <p className="text-[var(--c-muted)]">{customer.email}</p>
        </div>
        <form action={logout}><input type="hidden" name="slug" value={slug} /><button className="text-sm underline underline-offset-4">Se déconnecter</button></form>
      </div>
      <div className="grid gap-10 md:grid-cols-[1fr_260px]">
        <section>
          <h2 className="mb-4 font-[family-name:var(--t-display)] text-xl font-semibold">Mes commandes</h2>
          {orders.length ? (
            <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
              {orders.map((o) => (
                <li key={o.id}>
                  <a href={`/s/${slug}/order/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-4 hover:opacity-80">
                    <span>
                      <span className="font-semibold">Commande #{o.number}</span>
                      <span className="block text-sm text-[var(--c-muted)]">{o.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · {o.items.reduce((s, i) => s + i.quantity, 0)} article(s)</span>
                    </span>
                    <span className="text-right">
                      <span className="block tabular-nums">{formatMoney(o.totalCents, store.currency)}</span>
                      <span className="text-sm text-[var(--c-muted)]">{STATUS(o)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--c-muted)]">Vous n'avez pas encore passé de commande. <a href={`/s/${slug}/products`} className="underline underline-offset-4">Découvrir les produits</a></p>
          )}
        </section>
        <aside>
          <h2 className="mb-4 font-[family-name:var(--t-display)] text-xl font-semibold">Mes informations</h2>
          <form action={updateName} className="flex flex-col gap-2">
            <input type="hidden" name="slug" value={slug} />
            <label className="text-sm">Nom<input name="name" defaultValue={customer.name} maxLength={80} className={`${field} mt-1`} /></label>
            <button className="self-start rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 py-2 text-sm font-semibold">Enregistrer</button>
            {saved && <p role="status" className="text-sm text-[var(--c-muted)]">Enregistré.</p>}
          </form>
        </aside>
      </div>
    </div>
  );
}
