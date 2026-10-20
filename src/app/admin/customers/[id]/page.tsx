import Link from "next/link";
import { notFound } from "next/navigation";
import { adjustCredit, adjustPoints, saveCustomerLocale, saveCustomerNote, saveCustomerTags, setCustomerMarketing, setCustomerTaxExempt } from "../actions";
import { CustomerTimeline, type TimelineEntry } from "@/components/admin/CustomerTimeline";
import { recheckVat, saveCustomerB2B } from "../price-lists/actions";
import { PAYMENT_TERMS, termsLabel } from "@/lib/b2b";
import { isEuVatNumber } from "@/lib/tax";
import { splitTags } from "@/lib/segments";
import { PageHeader, Pill, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { storeCreditHistory } from "@/lib/store-credit";
import { FULFILLMENT_LABELS, paymentLabel, type Address } from "@/lib/orders";
import { formatDate, formatDateTime, parseJson } from "@/lib/utils";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vies?: string }> }) {
  const [{ id }, { vies }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("customers");
  const c = await db.customer.findFirst({ where: { id, storeId: store.id }, include: { orders: { orderBy: { createdAt: "desc" }, include: { items: true } } } });
  if (!c) notFound();
  const credits = await storeCreditHistory(c.id, 6);
  const [priceLists, entries, events, mails] = await Promise.all([
    db.priceList.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, percentOff: true } }),
    store.loyaltyEnabled ? db.loyaltyEntry.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 8 }) : [],
    db.customerEvent.findMany({ where: { customerId: c.id, storeId: store.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.mailLog.findMany({ where: { storeId: store.id, to: { in: [...new Set([c.email, c.email.toLowerCase()])] }, status: { not: "failed" } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, subject: true, createdAt: true } }),
  ]);
  // Chronologie : commentaires et modifications de la fiche, commandes, e-mails envoyés, création du client.
  const timeline: TimelineEntry[] = [
    ...events.map((e) => {
      const sep = e.type === "comment" ? e.message.indexOf(" : ") : -1;
      return { id: e.id, at: e.createdAt, type: e.type, text: sep > 0 ? e.message.slice(sep + 3) : e.message, author: sep > 0 ? e.message.slice(0, sep) : undefined };
    }),
    ...c.orders.map((o) => ({ id: `order-${o.id}`, at: o.createdAt, type: "order", text: `Ce client a passé la commande #${o.number} sur ${o.paymentMethod.startsWith("pos") ? "Point de vente" : o.paymentMethod === "manual" ? "Commande provisoire" : "Boutique en ligne"}${o.cancelledAt ? " (annulée)" : ""}.`, href: `/admin/orders/${o.id}` })),
    ...mails.map((m) => ({ id: `mail-${m.id}`, at: m.createdAt, type: "mail", text: `L'e-mail « ${m.subject} » a été envoyé à ce client.` })),
    { id: "created", at: c.createdAt, type: "created", text: "Le client a été créé." },
  ];
  const m = (x: number) => formatMoney(x, store.currency);
  const paid = c.orders.filter((o) => ["paid", "partially_refunded"].includes(o.paymentStatus) && !o.cancelledAt);
  const spent = paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const last = c.orders[0];
  const addr = last ? parseJson<Address>(last.address, { line1: "", zip: "", city: "", country: "" }) : null;
  const months = Math.max(0, Math.round((Date.now() - c.createdAt.getTime()) / (30 * 86400_000)));

  return (
    <>
      <PageHeader back="/admin/customers" title={c.company ? `${c.company} · ${c.name}` : c.name} subtitle={[addr ? `${addr.city}, ${addr.country}` : "", c.priceListId || c.paymentTermsDays ? "Client professionnel" : ""].filter(Boolean).join(" · ") || undefined} />
      <section className="card grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x">
        {[
          ["Montant dépensé", m(spent)],
          ["Commandes", String(paid.length)],
          ["Client depuis", months < 1 ? "Moins d'un mois" : `${months} mois`],
        ].map(([k, v]) => (
          <div key={k} className="p-4"><div className="text-xs font-[550] text-muted">{k}</div><div className="text-lg font-bold tabular-nums">{v}</div></div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {last && (
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-[650]">Dernière commande passée</h2>
              <div className="rounded-lg border border-line">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
                  <Link href={`/admin/orders/${last.id}`} className="font-[650] text-pine hover:underline">#{last.number}</Link>
                  {last.cancelledAt ? <Pill>Annulée</Pill> : <><Pill tone={paymentLabel(last).tone}>{paymentLabel(last).label}</Pill><Pill tone={FULFILLMENT_LABELS[last.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[last.fulfillmentStatus].label}</Pill></>}
                  <span className="ml-auto num">{m(last.totalCents)}</span>
                </div>
                <div className="px-3 pt-2 text-xs text-muted">{formatDateTime(last.createdAt)} · Boutique en ligne</div>
                <ul>
                  {last.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                      <Thumb image={i.image} hue={i.hue} title={i.productTitle} className="h-9 w-9 text-[10px]" />
                      <span className="flex-1"><span className="font-[550]">{i.productTitle}</span>{i.variantTitle !== "Par défaut" && <span className="text-muted"> · {i.variantTitle}</span>}</span>
                      <span className="num text-muted">× {i.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          <section className="card overflow-hidden">
            <div className="card-h"><h2 className="text-sm font-[650]">Toutes les commandes ({c.orders.length})</h2></div>
            <table className="w-full">
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#f7f7f7]">
                    <td className="td"><Link href={`/admin/orders/${o.id}`} className="font-[650] hover:underline">#{o.number}</Link></td>
                    <td className="td text-muted">{formatDate(o.createdAt)}</td>
                    <td className="td">{o.cancelledAt ? <Pill>Annulée</Pill> : <Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill>}</td>
                    <td className="td num text-right">{m(o.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <CustomerTimeline customerId={c.id} entries={timeline} />
        </div>
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-[650]">Client</h2>
            <div>
              <h3 className="text-[13px] font-[650]">Coordonnées</h3>
              <div className="break-all text-pine">{c.email}</div>
              {c.phone ? <div className="text-muted">{c.phone}</div> : <div className="text-xs text-muted">Aucun numéro de téléphone</div>}
              <form action={saveCustomerLocale} className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <input type="hidden" name="id" value={c.id} />
                <span>Recevra les notifications en</span>
                <select name="locale" defaultValue={c.locale} aria-label="Langue des notifications" className="input h-7 w-auto min-h-0 py-0 text-xs">
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
                <button className="btn btn-sm h-7">OK</button>
              </form>
            </div>
            <div>
              <h3 className="text-[13px] font-[650]">Marketing</h3>
              <div className="flex flex-wrap items-center gap-2">
                {c.acceptsMarketing ? <Pill tone="ok">Abonné aux e-mails</Pill> : c.subscribedAt ? <Pill>Désabonné des e-mails</Pill> : <Pill>Non abonné aux e-mails</Pill>}
                <form action={setCustomerMarketing}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="subscribe" value={c.acceptsMarketing ? "0" : "1"} /><button className="text-xs text-pine hover:underline">{c.acceptsMarketing ? "Désabonner" : "Abonner"}</button></form>
              </div>
              {c.subscribedAt && c.acceptsMarketing && <div className="text-xs text-muted">Depuis le {formatDate(c.subscribedAt)}</div>}
            </div>
            {(() => { const ad = parseJson<{ line1?: string; zip?: string; city?: string; country?: string }>(c.address, {}); return ad.line1 || ad.city ? <div><h3 className="text-[13px] font-[650]">Adresse</h3><address className="not-italic text-muted">{ad.line1}<br />{ad.zip} {ad.city}<br />{ad.country}</address></div> : null; })()}
            {addr && <div><h3 className="text-[13px] font-[650]">Adresse par défaut</h3><address className="not-italic text-muted">{addr.line1}<br />{addr.zip} {addr.city}<br />{addr.country}</address></div>}
            <div>
              <h3 className="text-[13px] font-[650]">Numéro de TVA</h3>
              <div className="text-muted">{c.vatNumber || "Aucun numéro de TVA"}</div>
            </div>
            <form action={setCustomerTaxExempt} className="flex flex-col gap-1.5">
              <input type="hidden" name="id" value={c.id} />
              <h3 className="text-[13px] font-[650]">Percevoir la taxe</h3>
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" name="taxExempt" defaultChecked={c.taxExempt} className="mt-0.5 h-4 w-4 accent-[#7c3aed]" />
                <span>Ne pas percevoir la taxe pour ce client<span className="block text-xs text-muted">Connecté à son compte, ce client paie hors taxes sur la boutique.</span></span>
              </label>
              {c.taxExempt && <Pill tone="warn">Exonéré de taxe</Pill>}
              <button className="btn btn-sm self-end">Enregistrer</button>
            </form>
          </section>
          <form id="recheck-vat" action={recheckVat} className="hidden"><input type="hidden" name="id" value={c.id} /></form>
          <form action={saveCustomerB2B} className="card flex flex-col gap-2.5 p-4">
            <input type="hidden" name="id" value={c.id} />
            <h2 className="text-sm font-[650]">Client professionnel</h2>
            <label className="label">Société<input name="company" defaultValue={c.company} maxLength={100} className="input" placeholder="Café des Arts SARL" /></label>
            <label className="label">N° de TVA intracommunautaire<input name="vatNumber" defaultValue={c.vatNumber} maxLength={20} className="input uppercase" placeholder="FR12345678901" /></label>
            {c.vatNumber && !isEuVatNumber(c.vatNumber) && <p className="text-xs text-[#8e0b21]">Ce numéro ne ressemble pas à un numéro de TVA de l'UE (préfixe du pays, puis chiffres).</p>}
            {c.vatNumber && isEuVatNumber(c.vatNumber) && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {c.vatValid === true ? <Pill tone="ok">Valide sur VIES</Pill> : c.vatValid === false ? <Pill tone="bad">Invalide sur VIES</Pill> : <Pill>Pas encore vérifié</Pill>}
                {c.vatRegisteredName && <span className="text-muted">{c.vatRegisteredName}</span>}
                <button form="recheck-vat" className="text-pine hover:underline">Vérifier{c.vatCheckedAt ? " à nouveau" : ""}</button>
              </div>
            )}
            {vies && <p className="text-xs text-[#8e0b21]">{vies}</p>}
            {c.vatNumber && isEuVatNumber(c.vatNumber) && !c.vatNumber.startsWith("FR") && store.taxRateBps > 0 && c.vatValid !== false && <p className="text-xs text-muted">Livré dans son pays ({c.vatNumber.slice(0, 2)}), ce client paie hors taxes (autoliquidation).</p>}
            {c.vatValid === false && <p className="text-xs text-[#8e0b21]">Numéro refusé par VIES : ce client paie la TVA.</p>}
            <label className="label">Liste de prix
              <select name="priceListId" defaultValue={c.priceListId ?? ""} className="input">
                <option value="">Prix publics</option>
                {priceLists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.percentOff ? ` (−${l.percentOff} %)` : ""}</option>)}
              </select>
            </label>
            <label className="label">Paiement
              <select name="paymentTermsDays" defaultValue={c.paymentTermsDays} className="input">
                {PAYMENT_TERMS.map((d) => <option key={d} value={d}>{termsLabel(d)}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">Le client voit ses prix et choisit le paiement à échéance une fois connecté à son compte sur la boutique.{!priceLists.length && <> <Link href="/admin/customers/price-lists" className="text-pine hover:underline">Créer une liste de prix</Link></>}</p>
            <button className="btn self-end">Enregistrer</button>
          </form>
          <section className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-[650]">Crédit en magasin</h2>{!store.loyaltyEnabled && !store.storeCreditEnabled && <Link href="/admin/settings/payments#credit" className="text-xs text-pine hover:underline">Activer</Link>}</div>
            <div className="text-2xl font-bold tabular-nums">{m(c.storeCreditCents)}</div>
            {!store.storeCreditEnabled && <p className="text-xs text-muted">Le crédit n'est pas encore activé pour la boutique : il ne sera pas déduit au paiement. <Link href="/admin/settings/payments#credit" className="text-pine hover:underline">Activer</Link></p>}
            {credits.length > 0 && <ul className="flex flex-col gap-1 text-xs">{credits.slice(0, 6).map((e) => <li key={e.id} className="flex justify-between gap-2"><span className="truncate text-muted" title={e.reason}>{e.reason}</span><span className={`tabular-nums ${e.deltaCents > 0 ? "text-[#0c5132]" : "text-[#8e0b21]"}`}>{e.deltaCents > 0 ? "+" : "−"}{m(Math.abs(e.deltaCents))}</span></li>)}</ul>}
            <form action={adjustCredit} className="mt-1 flex flex-wrap gap-1.5">
              <input type="hidden" name="id" value={c.id} />
              <select name="direction" className="input h-8 w-auto py-1" aria-label="Sens"><option value="add">Ajouter</option><option value="remove">Retirer</option></select>
              <input name="amount" inputMode="decimal" required placeholder="10,00" aria-label="Montant" className="input num h-8 w-24" />
              <input name="reason" placeholder="Motif (geste commercial…)" aria-label="Motif" className="input h-8 min-w-32 flex-1" />
              <button className="btn btn-sm h-8">OK</button>
            </form>
          </section>
          {store.loyaltyEnabled && (
            <section className="card flex flex-col gap-2 p-4">
              <h2 className="text-sm font-[650]">Fidélité</h2>
              <div className="text-2xl font-bold tabular-nums">{c.points} <span className="text-sm font-normal text-muted">points</span></div>
              <ul className="flex flex-col gap-1 text-xs">
                {entries.map((e) => <li key={e.id} className="flex justify-between gap-2"><span className="truncate text-muted">{e.reason}</span><span className={`tabular-nums ${e.points > 0 ? "text-[#0c5132]" : "text-[#8e0b21]"}`}>{e.points > 0 ? "+" : ""}{e.points}</span></li>)}
              </ul>
              <form action={adjustPoints} className="mt-1 flex gap-1.5">
                <input type="hidden" name="id" value={c.id} />
                <input name="points" type="number" required placeholder="+50 ou −20" aria-label="Points à ajouter ou retirer" className="input num h-8 w-24" />
                <input name="reason" placeholder="Motif" aria-label="Motif" className="input h-8 flex-1" />
                <button className="btn btn-sm h-8">OK</button>
              </form>
            </section>
          )}
          <form action={saveCustomerTags} className="card flex flex-col gap-2 p-4">
            <input type="hidden" name="id" value={c.id} />
            <h2 className="text-sm font-[650]">Étiquettes</h2>
            {splitTags(c.tags).length > 0 && (
              <div className="flex flex-wrap gap-1">{splitTags(c.tags).map((t) => <Link key={t} href={`/admin/customers?tag=${encodeURIComponent(t)}`} className="rounded-md bg-[#ebebeb] px-1.5 py-0.5 text-xs font-[550] hover:bg-[#e3e3e3]">{t}</Link>)}</div>
            )}
            <input id="customer-tags" name="tags" defaultValue={splitTags(c.tags).join(", ")} maxLength={300} className="input" placeholder="vip, grossiste, salon 2026" aria-label="Étiquettes séparées par des virgules" />
            <p className="text-xs text-muted">Séparées par des virgules. Utilisables dans les segments.</p>
            <button className="btn self-end">Enregistrer</button>
          </form>
          <form action={saveCustomerNote} className="card flex flex-col gap-2 p-4">
            <input type="hidden" name="id" value={c.id} />
            <h2 className="text-sm font-[650]">Notes</h2>
            <textarea id="customer-note" name="note" defaultValue={c.note} maxLength={2000} className="input min-h-[80px]" placeholder="Ajoutez une note sur ce client (visible seulement par votre équipe)" />
            <button className="btn self-end">Enregistrer</button>
          </form>
        </aside>
      </div>
    </>
  );
}
