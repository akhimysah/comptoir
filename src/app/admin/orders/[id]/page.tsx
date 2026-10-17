import Link from "next/link";
import { notFound } from "next/navigation";
import { addOrderComment, cancelOrder, markPaid, markPickupReady, returnDecision, sendInvoiceAction, setFulfilled, updateTracking } from "../actions";
import { CopyField } from "@/components/admin/CopyField";
import { invoicePayable, payLink } from "@/lib/invoices";
import { TrackingFields } from "@/components/admin/TrackingFields";
import { carrierLabel, trackingLink } from "@/lib/tracking";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { canFulfill, FULFILLMENT_LABELS, paymentLabel, type Address } from "@/lib/orders";
import { formatDate, formatDateTime, initials, parseJson } from "@/lib/utils";
import { RETURN_STATUS, returnLines } from "@/lib/returns";
import { storeLocations } from "@/lib/locations";

const EVENT_TEXT: Record<string, string> = {
  fulfilled: "a expédié la commande.",
  tracking_updated: "a modifié le suivi :",
  invoice_sent: "a envoyé la facture à",
  pickup_ready: "a indiqué que la commande est prête pour le retrait.",
  edited: "a modifié la commande :",
  unfulfilled: "a remis la commande à traiter.",
  cancelled: "a annulé la commande.",
  refunded: "a annulé et remboursé la commande.",
  paid_manual: "a marqué la commande comme payée.",
  refund: "a effectué un remboursement :",
  cancelled_refund: "a annulé la commande et remboursé :",
  created_manual: "a créé cette commande manuellement.",
  pos_sale: "a encaissé cette vente au point de vente :",
  giftcards_sent: "",
  return_requested: "a demandé un retour :",
  return_approved: "a accepté le retour.",
  return_declined: "a refusé le retour.",
  return_received: "a reçu les articles retournés.",
  return_reopened: "a rouvert la demande de retour.",
  return_refunded: "a remboursé le retour.",
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const [{ id }, { err }] = await Promise.all([params, searchParams]);
  const { user, store } = await requirePerm("orders");
  const o = await db.order.findFirst({
    where: { id, storeId: store.id },
    include: { items: true, returns: { orderBy: { createdAt: "desc" } }, events: { orderBy: { createdAt: "desc" } }, customer: { include: { _count: { select: { orders: true } } } } },
  });
  if (!o) notFound();
  const a = parseJson<Address>(o.address, { line1: "", zip: "", city: "", country: "" });
  const m = (c: number) => formatMoney(c, store.currency);
  const qty = o.items.reduce((s, i) => s + i.quantity, 0);
  const pay = paymentLabel(o);
  // Commande créée dans l'admin et pas encore réglée : elle peut être payée en ligne via un lien.
  const invoiceLink = ["manual", "terms"].includes(o.paymentMethod) && invoicePayable(o) ? await payLink(o, store.slug) : null;
  const ful = FULFILLMENT_LABELS[o.fulfillmentStatus];
  const locations = await storeLocations(store);
  const shippedFrom = o.fulfillmentLocationId ? locations.find((l) => l.id === o.fulfillmentLocationId)?.name : null;

  // Les étapes automatiques (création, paiement) viennent des champs de la commande ; le reste de la table des événements.
  const timeline = [
    ...o.events.map((e) => ({ at: e.createdAt, kind: e.type, text: e.type === "comment" ? e.message : `${e.author || "Quelqu'un"} ${EVENT_TEXT[e.type] ?? e.type}${e.message && e.type !== "comment" ? ` ${e.message}` : ""}`, author: e.author })),
    ...(o.paidAt && !o.events.some((e) => e.type === "paid_manual") ? [{ at: o.paidAt, kind: "paid", text: `Paiement de ${m(o.totalCents)} reçu${o.paymentMethod === "stripe" ? " par carte (Stripe)" : o.paymentMethod === "manual" ? " (paiement hors ligne)" : o.paymentMethod === "pos_cash" ? " en espèces" : o.paymentMethod === "pos_card" ? " par carte (terminal)" : " (démonstration)"}.`, author: "" }] : []),
    ...(o.paymentMethod === "manual" || o.paymentMethod.startsWith("pos") ? [] : [{ at: o.createdAt, kind: "created", text: `${o.name} a passé cette commande sur la boutique en ligne.`, author: "" }]),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());

  return (
    <>
      <PageHeader
        back="/admin/orders"
        title={`#${o.number}`}
        subtitle={`${formatDateTime(o.createdAt)} · ${o.paymentMethod === "manual" ? "Créée dans l'admin" : o.paymentMethod.startsWith("pos") ? "Point de vente" : "Boutique en ligne"}${o.dueAt ? ` · paiement à échéance (${formatDate(o.dueAt)})` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!o.cancelledAt && o.fulfillmentStatus !== "fulfilled" && !o.paymentMethod.startsWith("pos") && <Link href={`/admin/orders/${o.id}/edit`} className="btn h-8">Modifier</Link>}
            <a href={`/print/packing?ids=${o.id}`} target="_blank" className="btn h-8">Bon de préparation</a>
            {(o.paymentStatus !== "pending" || o.dueAt) && <a href={`/print/invoice/${o.id}`} target="_blank" className="btn h-8">Facture</a>}
            {o.cancelledAt ? <Pill>Annulée</Pill> : <><Pill tone={pay.tone}>{pay.label}</Pill><Pill tone={ful.tone}>{ful.label}</Pill></>}
            {!o.cancelledAt && ["paid", "partially_refunded"].includes(o.paymentStatus) && o.totalCents - o.refundedCents > 0 && <a href={`/admin/orders/${o.id}/refund`} className="btn h-8">Rembourser</a>}
            {!o.cancelledAt && (
              <form action={cancelOrder}>
                <input type="hidden" name="id" value={o.id} />
                <ConfirmSubmit label="Annuler la commande" confirmLabel={["paid", "partially_refunded"].includes(o.paymentStatus) ? "Annuler et tout rembourser" : "Confirmer l'annulation"} className="h-8" />
              </form>
            )}
          </div>
        }
      />

      {err && <p role="alert" className="mb-4 rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {o.returns.map((r) => {
            const st = RETURN_STATUS[r.status as keyof typeof RETURN_STATUS] ?? { label: r.status, tone: "neutral" as const };
            const lines = returnLines(r);
            const hidden = <><input type="hidden" name="returnId" value={r.id} /></>;
            const decline = (
              <details className="group">
                <summary className="btn cursor-pointer list-none">Refuser</summary>
                <form action={returnDecision} className="mt-2 flex flex-col gap-2">
                  {hidden}<input type="hidden" name="action" value="decline" />
                  <textarea name="reason" rows={2} maxLength={500} placeholder="Motif envoyé au client (ex. : délai dépassé, article porté)" className="input" />
                  <button className="btn self-start">Refuser le retour</button>
                </form>
              </details>
            );
            return (
              <section key={r.id} className={`card overflow-hidden ${r.status === "requested" ? "ring-2 ring-[#ffeb78]" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
                  <Pill tone={st.tone}>Retour · {st.label}</Pill>
                  <span className="text-xs text-muted">Demandé le {formatDateTime(r.createdAt)}</span>
                </div>
                <ul className="m-3 rounded-lg border border-line">
                  {lines.map((l) => {
                    const i = o.items.find((x) => x.id === l.orderItemId);
                    return (
                      <li key={l.orderItemId} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
                        <Thumb image={i?.image ?? null} hue={i?.hue ?? 200} title={i?.productTitle ?? "?"} className="h-10 w-10 text-[10px]" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-[550]">{i?.productTitle ?? "Article supprimé"}{i && i.variantTitle !== "Par défaut" ? <span className="text-muted"> · {i.variantTitle}</span> : null}</div>
                          <div className="text-xs text-muted">{l.reason}</div>
                        </div>
                        <span className="num text-muted">× {l.quantity}</span>
                      </li>
                    );
                  })}
                </ul>
                {r.note && <p className="mx-4 mb-3 whitespace-pre-line rounded-lg bg-[#f7f7f7] px-3 py-2 text-[13px]">« {r.note} »</p>}
                {r.status === "declined" && r.declineReason && <p className="mx-4 mb-3 text-[13px] text-muted">Motif du refus : {r.declineReason}</p>}
                {r.status !== "refunded" && (
                  <div className="flex flex-wrap items-start justify-end gap-2 border-t border-line px-4 py-3">
                    {r.status === "requested" && <>{decline}<form action={returnDecision}>{hidden}<input type="hidden" name="action" value="approve" /><button className="btn btn-primary">Accepter le retour</button></form></>}
                    {r.status === "approved" && <>{decline}<a href={`/admin/orders/${o.id}/refund?return=${r.id}`} className="btn">Rembourser sans attendre</a><form action={returnDecision}>{hidden}<input type="hidden" name="action" value="receive" /><button className="btn btn-primary">Marquer comme reçu</button></form></>}
                    {r.status === "received" && <a href={`/admin/orders/${o.id}/refund?return=${r.id}`} className="btn btn-primary">Rembourser le retour</a>}
                    {r.status === "declined" && <form action={returnDecision}>{hidden}<input type="hidden" name="action" value="reopen" /><button className="btn">Rouvrir la demande</button></form>}
                  </div>
                )}
              </section>
            );
          })}
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
                    {i.refundedQuantity > 0 && <Pill>{i.refundedQuantity} remboursé{i.refundedQuantity > 1 ? "s" : ""}</Pill>}
                    <span className="num whitespace-nowrap text-muted">{m(i.priceCents)} × {i.quantity}</span>
                    <span className="num w-20 text-right">{m(i.priceCents * i.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {o.fulfillmentStatus === "fulfilled" && (
              <div className="mx-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#f7f7f7] px-3 py-2.5 text-[13px]">
                <span className="font-[550]">{o.deliveryMethod === "pickup" ? "Récupérée en boutique" : "Expédiée"}{o.fulfilledAt ? ` le ${formatDateTime(o.fulfilledAt)}` : ""}{shippedFrom ? ` · depuis ${shippedFrom}` : ""}</span>
                {o.deliveryMethod === "pickup" ? null : o.trackingNumber ? (
                  <>
                    <span className="text-muted">{carrierLabel(o.trackingCarrier)}</span>
                    {trackingLink(o) ? <a href={trackingLink(o)!} target="_blank" rel="noopener noreferrer" className="font-mono text-pine hover:underline">{o.trackingNumber}</a> : <span className="font-mono">{o.trackingNumber}</span>}
                  </>
                ) : <span className="text-muted">sans numéro de suivi</span>}
              </div>
            )}
            {canFulfill(o) && o.deliveryMethod === "pickup" && o.fulfillmentStatus !== "fulfilled" && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
                <span className="text-[13px] text-muted">{o.pickupReadyAt ? `Prête depuis le ${formatDateTime(o.pickupReadyAt)} : en attente du client.` : "Retrait en boutique : préparez la commande puis prévenez le client."}</span>
                {o.pickupReadyAt ? (
                  <form action={setFulfilled}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="value" value="fulfilled" />
                    <input type="hidden" name="hasNotify" value="1" />
                    <button className="btn btn-primary">Marquer comme récupérée</button>
                  </form>
                ) : (
                  <form action={markPickupReady} className="flex items-center gap-3">
                    <input type="hidden" name="id" value={o.id} />
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-[#7c3aed]" />Prévenir le client</label>
                    <button className="btn btn-primary">Prête pour le retrait</button>
                  </form>
                )}
              </div>
            )}
            {canFulfill(o) && (o.deliveryMethod !== "pickup" || o.fulfillmentStatus === "fulfilled") && (
              o.fulfillmentStatus === "fulfilled" ? (
                <div className="flex flex-wrap items-start justify-end gap-2 border-t border-line px-4 py-3">
                  <details className={`mr-auto ${o.deliveryMethod === "pickup" ? "hidden" : ""}`}>
                    <summary className="btn cursor-pointer list-none">{o.trackingNumber ? "Modifier le suivi" : "Ajouter un suivi"}</summary>
                    <form action={updateTracking} className="mt-3 flex flex-col gap-3">
                      <input type="hidden" name="id" value={o.id} />
                      <TrackingFields carrier={o.trackingCarrier} number={o.trackingNumber} url={o.trackingUrl} />
                      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-[#7c3aed]" />Envoyer le nouveau suivi au client</label>
                      <button className="btn btn-primary self-start">Enregistrer le suivi</button>
                    </form>
                  </details>
                  <form action={setFulfilled}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="value" value="unfulfilled" />
                    <button className="btn">Annuler le traitement</button>
                  </form>
                </div>
              ) : (
                <form action={setFulfilled} className="flex flex-col gap-3 border-t border-line px-4 py-3">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="value" value="fulfilled" />
                  <input type="hidden" name="hasNotify" value="1" />
                  {locations.length > 1 && (
                    <label className="label">Expédier depuis
                      <select name="locationId" defaultValue="primary" className="input">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                    </label>
                  )}
                  <TrackingFields />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-[#7c3aed]" />Prévenir le client par e-mail</label>
                    <button className="btn btn-primary">Traiter les articles</button>
                  </div>
                </form>
              )
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="px-4 pt-4">{o.cancelledAt && o.paymentStatus !== "refunded" ? <Pill>Annulée</Pill> : <Pill tone={pay.tone}>{pay.label}</Pill>}</div>
            <dl className="m-3 grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-line p-3">
              <dt>Sous-total</dt><dd className="text-muted">{qty} article{qty > 1 ? "s" : ""}</dd><dd className="num text-right">{m(o.subtotalCents)}</dd>
              {o.discountCents > 0 && <><dt>Remise</dt><dd className="text-muted">{o.discountCode ?? "Remise manuelle"}</dd><dd className="num text-right">−{m(o.discountCents)}</dd></>}
              <dt>Expédition</dt><dd className="text-muted">{o.shippingMethod || "Livraison standard"}</dd><dd className="num text-right">{o.shippingCents ? m(o.shippingCents) : "Offerte"}</dd>
              {o.giftCardCents > 0 && <><dt>Carte cadeau</dt><dd className="text-muted">····{o.giftCardCode?.slice(-4)}</dd><dd className="num text-right">−{m(o.giftCardCents)}</dd></>}
              {o.reverseCharge && <><dt className="text-xs text-muted">TVA</dt><dd className="text-xs text-muted">Autoliquidation (client UE)</dd><dd className="num text-right text-xs text-muted">{m(0)}</dd></>}
              {o.taxCents > 0 && <><dt className="text-xs text-muted">dont TVA</dt><dd className="text-xs text-muted">{(o.taxRateBps / 100).toLocaleString("fr-FR")} %</dd><dd className="num text-right text-xs text-muted">{m(o.taxCents)}</dd></>}
              <dt className="font-[650]">{o.giftCardCents > 0 ? "Reste à payer" : "Total"}</dt><dd /><dd className="num text-right font-[650]">{m(o.totalCents)}</dd>
              <dt className="col-span-3 my-1 border-t border-line" />
              <dt>Payé par le client</dt><dd className="text-muted">{o.presentmentCurrency && o.paymentStatus !== "pending" ? `${formatMoney(o.presentmentTotalCents ?? 0, o.presentmentCurrency)} (1 ${store.currency} = ${o.presentmentRate.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${o.presentmentCurrency})` : ""}</dd><dd className="num text-right">{o.paymentStatus === "pending" ? m(0) : m(o.totalCents)}</dd>
              {o.refundedCents > 0 && <><dt>Remboursé</dt><dd /><dd className="num text-right">−{m(o.refundedCents)}</dd><dt className="font-[650]">Net</dt><dd /><dd className="num text-right font-[650]">{m(o.totalCents - o.refundedCents)}</dd></>}
            </dl>
            {!invoiceLink && !o.cancelledAt && o.paymentStatus === "pending" && o.paymentMethod !== "stripe" && (
              <form action={markPaid} className="flex justify-end border-t border-line px-4 py-3">
                <input type="hidden" name="id" value={o.id} />
                <button className="btn btn-primary">Marquer comme payée</button>
              </form>
            )}
            {invoiceLink && (
              <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                <div className="text-[13px]">
                  <span className="font-[650]">Lien de paiement</span>
                  <span className="text-muted"> · {o.invoiceSentAt ? `facture envoyée le ${formatDateTime(o.invoiceSentAt)} à ${o.email}` : "à envoyer au client, ou à copier dans un message"}</span>
                </div>
                <CopyField value={invoiceLink} label="Lien de paiement de la commande" />
              </div>
            )}
            {invoiceLink && (
              <div className="flex flex-wrap items-start justify-end gap-2 border-t border-line px-4 py-3">
                <details className="mr-auto">
                  <summary className="btn cursor-pointer list-none">{o.invoiceSentAt ? "Renvoyer la facture" : "Envoyer la facture"}</summary>
                  <form action={sendInvoiceAction} className="mt-3 flex w-[min(28rem,80vw)] flex-col gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <label className="label">Message au client <span className="hint">Facultatif</span>
                      <textarea name="message" rows={3} maxLength={1000} className="input" placeholder="Bonjour, voici votre commande comme convenu. Bonne journée !" />
                    </label>
                    <button className="btn btn-primary self-start">Envoyer à {o.email}</button>
                  </form>
                </details>
                <form action={markPaid}>
                  <input type="hidden" name="id" value={o.id} />
                  <button className="btn">Marquer comme payée</button>
                </form>
              </div>
            )}
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
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-canvas ${t.kind === "comment" ? "bg-[#8b5cf6]" : "bg-[#8a8a8a]"}`} />
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
              <h3 className="mb-1 text-[13px] font-[650]">{o.deliveryMethod === "pickup" ? "Mode de réception" : "Adresse d'expédition"}</h3>
              {o.deliveryMethod === "pickup" ? <div><Pill tone="info" dot={false}>Retrait en boutique</Pill><div className="mt-1 whitespace-pre-line text-muted">{store.pickupAddress}</div></div> : <address className="not-italic">{o.name}<br />{a.line1}<br />{a.zip} {a.city}<br />{a.country}</address>}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
