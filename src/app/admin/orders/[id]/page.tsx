import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrder, setFulfilled } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS, type Address } from "@/lib/orders";
import { formatDateTime, parseJson } from "@/lib/utils";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requireStore();
  const o = await db.order.findFirst({ where: { id, storeId: store.id }, include: { items: true, customer: { include: { _count: { select: { orders: true } } } } } });
  if (!o) notFound();
  const a = parseJson<Address>(o.address, { line1: "", zip: "", city: "", country: "" });
  const m = (c: number) => formatMoney(c, store.currency);

  return (
    <>
      <div><Link href="/admin/orders" className="text-sm font-semibold text-pine">← Commandes</Link></div>
      <PageHeader
        title={`Commande #${o.number}`}
        subtitle={formatDateTime(o.createdAt)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {o.cancelledAt ? <Pill tone="bad">Annulée</Pill> : <Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill>}
            {!o.cancelledAt && o.paymentStatus === "paid" && <Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill>}
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card">
            <ul>
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                  <Thumb image={i.image} hue={i.hue} title={i.productTitle} className="h-12 w-12 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{i.productTitle}</div>
                    {i.variantTitle !== "Par défaut" && <div className="text-sm text-muted">{i.variantTitle}</div>}
                  </div>
                  <span className="num text-sm text-muted">{i.quantity} × {m(i.priceCents)}</span>
                  <span className="num w-24 text-right">{m(i.priceCents * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-line px-5 py-4 text-sm">
              <dt className="text-muted">Sous-total</dt><dd className="num text-right">{m(o.subtotalCents)}</dd>
              {o.discountCents > 0 && <><dt className="text-muted">Code promo <span className="font-mono">{o.discountCode}</span></dt><dd className="num text-right">−{m(o.discountCents)}</dd></>}
              <dt className="text-muted">Livraison</dt><dd className="num text-right">{o.shippingCents ? m(o.shippingCents) : "Offerte"}</dd>
              <dt className="border-t border-line pt-2 font-bold">Total</dt><dd className="num border-t border-line pt-2 text-right font-bold">{m(o.totalCents)}</dd>
              <dt className="text-muted">Paiement</dt><dd className="text-right">{o.paymentMethod === "stripe" ? "Carte (Stripe)" : "Démonstration"}</dd>
            </dl>
          </section>

          {!o.cancelledAt && (
            <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="text-base font-bold">{o.paymentStatus !== "paid" ? "En attente du paiement" : o.fulfillmentStatus === "fulfilled" ? "Commande expédiée" : "Prête à expédier"}</h2>
                <p className="text-sm text-muted">{o.paymentStatus !== "paid" ? "Le client n'a pas encore terminé son paiement." : o.fulfillmentStatus === "fulfilled" ? "Vous pouvez revenir en arrière si besoin." : "Emballez les articles puis marquez la commande comme expédiée."}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {o.paymentStatus === "paid" && (
                  <form action={setFulfilled}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="value" value={o.fulfillmentStatus === "fulfilled" ? "unfulfilled" : "fulfilled"} />
                    <button className={o.fulfillmentStatus === "fulfilled" ? "btn" : "btn btn-primary"}>{o.fulfillmentStatus === "fulfilled" ? "Remettre à expédier" : "Marquer comme expédiée"}</button>
                  </form>
                )}
                <form action={cancelOrder}>
                  <input type="hidden" name="id" value={o.id} />
                  <ConfirmSubmit label={o.paymentStatus === "paid" ? "Annuler et rembourser" : "Annuler"} confirmLabel="Confirmer l'annulation" />
                </form>
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <section className="card p-5 text-sm">
            <h2 className="mb-2 text-base font-bold">Client</h2>
            <div className="font-semibold">{o.name}</div>
            <div className="break-all text-muted">{o.email}</div>
            {o.customer && <div className="mt-1 text-muted">{o.customer._count.orders} commande{o.customer._count.orders > 1 ? "s" : ""} au total</div>}
            <h3 className="mb-1 mt-4 font-bold">Adresse de livraison</h3>
            <address className="not-italic text-muted">{a.line1}<br />{a.zip} {a.city}<br />{a.country}</address>
            {o.note && <><h3 className="mb-1 mt-4 font-bold">Note du client</h3><p className="whitespace-pre-line text-muted">{o.note}</p></>}
          </section>
        </aside>
      </div>
    </>
  );
}
