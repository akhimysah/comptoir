import Link from "next/link";
import { notFound } from "next/navigation";
import { addOrderComment, cancelOrder, setFulfilled } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS, type Address } from "@/lib/orders";
import { formatDateTime, initials, parseJson } from "@/lib/utils";

const EVENT_TEXT: Record<string, string> = {
  fulfilled: "a marqué la commande comme traitée.",
  unfulfilled: "a remis la commande à traiter.",
  cancelled: "a annulé la commande.",
  refunded: "a annulé et remboursé la commande.",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, store } = await requireStore();
  const o = await db.order.findFirst({
    where: { id, storeId: store.id },
    include: { items: true, events: { orderBy: { createdAt: "desc" } }, customer: { include: { _count: { select: { orders: true } } } } },
  });
  if (!o) notFound();
  const a = parseJson<Address>(o.address, { line1: "", zip: "", city: "", country: "" });
  const m = (c: number) => formatMoney(c, store.currency);
  const qty = o.items.reduce((s, i) => s + i.quantity, 0);
  const pay = PAYMENT_LABELS[o.paymentStatus];
  const ful = FULFILLMENT_LABELS[o.fulfillmentStatus];

  // Les étapes automatiques (création, paiement) viennent des champs de la commande ; le reste de la table des événements.
  const timeline = [
    ...o.events.map((e) => ({ at: e.createdAt, kind: e.type, text: e.type === "comment" ? e.message : `${e.author || "Quelqu'un"} ${EVENT_TEXT[e.type] ?? e.type}`, author: e.author })),
    ...(o.paidAt ? [{ at: o.paidAt, kind: "paid", text: `Paiement de ${m(o.totalCents)} reçu${o.paymentMethod === "stripe" ? " par carte (Stripe)" : " (démonstration)"}.`, author: "" }] : []),
    { at: o.createdAt, kind: "created", text: `${o.name} a passé cette commande sur la boutique en ligne.`, author: "" },
  ].sort((x, y) => y.at.getTime() - x.at.getTime());

  return (
    <>
      <PageHeader
        back="/admin/orders"
        title={`#${o.number}`}
        subtitle={`${formatDateTime(o.createdAt)} · Boutique en ligne`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {o.cancelledAt ? <Pill>Annulée</Pill> : <><Pill tone={pay.tone}>{pay.label}</Pill><Pill tone={ful.tone}>{ful.label}</Pill></>}
            {!o.cancelledAt && (
              <form action={cancelOrder}>
                <input type="hidden" name="id" value={o.id} />
                <ConfirmSubmit label={o.paymentStatus === "paid" ? "Rembourser" : "Annuler"} confirmLabel="Confirmer" className="h-8" />
              </form>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-4">
              {o.cancelledAt ? <Pill>Annulée</Pill> : <Pill tone={ful.tone}>{ful.label} ({qty})</Pill>}
            </div>
            <div className="m-3 rounded-lg border border-line">
              <ul>
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
                    <Thumb image={i.image} hue={i.hue} title={i.productTitle} className="h-10 w-10 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-[550] text-pine">{i.productTitle}</div>
                      {i.variantTitle !== "Par défaut" && <span className="mt-0.5 inline-block rounded-md bg-[#ebebeb] px-1.5 text-xs">{i.variantTitle}</span>}
                    </div>
                    <span className="num whitespace-nowrap text-muted">{m(i.priceCents)} × {i.quantity}</span>
                    <span className="num w-20 text-right">{m(i.priceCents * i.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {!o.cancelledAt && o.paymentStatus === "paid" && (
              <div className="flex justify-end border-t border-line px-4 py-3">
                <form action={setFulfilled}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="value" value={o.fulfillmentStatus === "fulfilled" ? "unfulfilled" : "fulfilled"} />
                  <button className={o.fulfillmentStatus === "fulfilled" ? "btn" : "btn btn-primary"}>{o.fulfillmentStatus === "fulfilled" ? "Annuler le traitement" : "Traiter les articles"}</button>
                </form>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="px-4 pt-4">{o.cancelledAt && o.paymentStatus !== "refunded" ? <Pill>Annulée</Pill> : <Pill tone={pay.tone}>{pay.label}</Pill>}</div>
            <dl className="m-3 grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-line p-3">
              <dt>Sous-total</dt><dd className="text-muted">{qty} article{qty > 1 ? "s" : ""}</dd><dd className="num text-right">{m(o.subtotalCents)}</dd>
              {o.discountCents > 0 && <><dt>Remise</dt><dd className="text-muted">{o.discountCode}</dd><dd className="num text-right">−{m(o.discountCents)}</dd></>}
              <dt>Expédition</dt><dd className="text-muted">Livraison standard</dd><dd className="num text-right">{o.shippingCents ? m(o.shippingCents) : "Offerte"}</dd>
              <dt className="font-[650]">Total</dt><dd /><dd className="num text-right font-[650]">{m(o.totalCents)}</dd>
              <dt className="col-span-3 my-1 border-t border-line" />
              <dt>{o.paymentStatus === "refunded" ? "Remboursé" : "Payé par le client"}</dt><dd /><dd className="num text-right">{o.paymentStatus === "pending" ? m(0) : m(o.totalCents)}</dd>
            </dl>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="px-1 text-sm font-[650]">Chronologie</h2>
            <form action={addOrderComment} className="card flex items-start gap-3 p-3">
              <input type="hidden" name="id" value={o.id} />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#c4b5fd] text-xs font-semibold text-[#2e1065]">{initials(user.name)}</span>
              <textarea id="order-comment" name="message" required maxLength={2000} rows={1} placeholder="Laisser un commentaire…" className="input min-h-8 flex-1 resize-y" />
              <button className="btn">Publier</button>
            </form>
            <p className="px-1 text-xs text-muted">Seuls vous et votre équipe voyez les commentaires.</p>
            <ol className="relative ml-4 flex flex-col gap-4 border-l-2 border-[#d4d4d4] pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-canvas ${t.kind === "comment" ? "bg-[#4b9fe8]" : "bg-[#8a8a8a]"}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {t.kind === "comment" ? (
                      <div className="card max-w-full px-3 py-2"><div className="text-xs font-[550] text-muted">{t.author}</div><p className="whitespace-pre-line">{t.text}</p></div>
                    ) : (
                      <span>{t.text}</span>
                    )}
                    <time className="text-xs text-muted">{formatDateTime(t.at)}</time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="mb-1 text-sm font-[650]">Notes</h2>
            <p className="whitespace-pre-line text-muted">{o.note || "Aucune note du client"}</p>
          </section>
          <section className="card flex flex-col gap-3 p-4">
            <div>
              <h2 className="mb-1 text-sm font-[650]">Client</h2>
              {o.customer ? <Link href={`/admin/customers/${o.customer.id}`} className="text-pine hover:underline">{o.name}</Link> : <span>{o.name}</span>}
              {o.customer && <div className="text-muted">{o.customer._count.orders} commande{o.customer._count.orders > 1 ? "s" : ""}</div>}
            </div>
            <div>
              <h3 className="mb-1 text-[13px] font-[650]">Coordonnées</h3>
              <div className="break-all text-pine">{o.email}</div>
            </div>
            <div>
              <h3 className="mb-1 text-[13px] font-[650]">Adresse d'expédition</h3>
              <address className="not-italic">{o.name}<br />{a.line1}<br />{a.zip} {a.city}<br />{a.country}</address>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
