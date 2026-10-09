import Link from "next/link";
import { notFound } from "next/navigation";
import { saveCustomerNote } from "../actions";
import { PageHeader, Pill, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS, type Address } from "@/lib/orders";
import { formatDate, formatDateTime, parseJson } from "@/lib/utils";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("customers");
  const c = await db.customer.findFirst({ where: { id, storeId: store.id }, include: { orders: { orderBy: { createdAt: "desc" }, include: { items: true } } } });
  if (!c) notFound();
  const m = (x: number) => formatMoney(x, store.currency);
  const paid = c.orders.filter((o) => ["paid", "partially_refunded"].includes(o.paymentStatus) && !o.cancelledAt);
  const spent = paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const last = c.orders[0];
  const addr = last ? parseJson<Address>(last.address, { line1: "", zip: "", city: "", country: "" }) : null;
  const months = Math.max(0, Math.round((Date.now() - c.createdAt.getTime()) / (30 * 86400_000)));

  return (
    <>
      <PageHeader back="/admin/customers" title={c.name} subtitle={addr ? `${addr.city}, ${addr.country}` : undefined} />
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
                  {last.cancelledAt ? <Pill>Annulée</Pill> : <><Pill tone={PAYMENT_LABELS[last.paymentStatus].tone}>{PAYMENT_LABELS[last.paymentStatus].label}</Pill><Pill tone={FULFILLMENT_LABELS[last.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[last.fulfillmentStatus].label}</Pill></>}
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
        </div>
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-[650]">Client</h2>
            <div><h3 className="text-[13px] font-[650]">Coordonnées</h3><div className="break-all text-pine">{c.email}</div></div>
            {addr && <div><h3 className="text-[13px] font-[650]">Adresse par défaut</h3><address className="not-italic text-muted">{addr.line1}<br />{addr.zip} {addr.city}<br />{addr.country}</address></div>}
          </section>
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
