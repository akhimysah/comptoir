import type { Order, OrderItem, Store } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import type { Address } from "@/lib/orders";
import { FRANCHISE_MENTION, includedTax, rateLabel } from "@/lib/tax";
import { parseJson } from "@/lib/utils";

type FullOrder = Order & { items: OrderItem[]; customer?: { company: string; vatNumber: string } | null };
const sheet = "sheet mx-auto mb-6 w-full max-w-[210mm] bg-white p-[14mm] text-[12px] leading-relaxed shadow-[0_2px_12px_rgba(0,0,0,.15)]";
const date = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function Seller({ store }: { store: Store }) {
  return (
    <div>
      <div className="text-[18px] font-bold">{store.legalName || store.name}</div>
      {store.legalAddress && <div className="whitespace-pre-line text-[#555]">{store.legalAddress}</div>}
      {store.siret && <div className="text-[#555]">SIRET {store.siret}</div>}
      {store.vatNumber && <div className="text-[#555]">TVA intracommunautaire {store.vatNumber}</div>}
    </div>
  );
}

function ShipTo({ order }: { order: FullOrder }) {
  const a = parseJson<Address>(order.address, { line1: "", zip: "", city: "", country: "" });
  if (order.deliveryMethod === "pickup") return <div>{order.name}<br /><b>Retrait en boutique</b></div>;
  return <div>{order.name}<br />{a.line1}<br />{a.zip} {a.city}<br />{a.country}</div>;
}

export function Invoice({ store, order }: { store: Store; order: FullOrder }) {
  const m = (c: number) => formatMoney(c, store.currency);
  const rate = order.taxRateBps || store.taxRateBps;
  const gross = order.totalCents + order.giftCardCents; // valeur TTC des articles et de la livraison
  const tax = order.taxCents || includedTax(gross, rate);
  return (
    <section className={sheet}>
      <header className="mb-10 flex justify-between gap-6">
        <Seller store={store} />
        <div className="text-right">
          <div className="text-[22px] font-bold">Facture</div>
          <div>N° F-{order.number}</div>
          <div className="text-[#555]">Date : {date(order.paidAt ?? order.createdAt)}</div>
          <div className="text-[#555]">Commande #{order.number}</div>
          {order.dueAt && <div className="font-semibold">Échéance : {date(order.dueAt)}</div>}
        </div>
      </header>
      <div className="mb-8 grid grid-cols-2 gap-6">
        <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#777]">Facturé à</div>{order.customer?.company && <div className="font-semibold">{order.customer.company}</div>}<div>{order.name}</div>{order.customer?.vatNumber && <div className="text-[#555]">TVA intracommunautaire {order.customer.vatNumber}</div>}<div className="text-[#555]">{order.email}</div></div>
        <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#777]">Livré à</div><ShipTo order={order} /></div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-b-2 border-[#111] text-left"><th className="py-2">Désignation</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">Prix unitaire TTC</th><th className="py-2 text-right">Total TTC</th></tr></thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} className="border-b border-[#ddd]">
              <td className="py-2">{i.productTitle}{i.variantTitle !== "Par défaut" ? ` · ${i.variantTitle}` : ""}</td>
              <td className="py-2 text-right tabular-nums">{i.quantity}</td>
              <td className="py-2 text-right tabular-nums">{m(i.priceCents)}</td>
              <td className="py-2 text-right tabular-nums">{m(i.priceCents * i.quantity)}</td>
            </tr>
          ))}
          {order.shippingCents > 0 && <tr className="border-b border-[#ddd]"><td className="py-2">Livraison{order.shippingMethod ? ` · ${order.shippingMethod}` : ""}</td><td className="py-2 text-right">1</td><td className="py-2 text-right tabular-nums">{m(order.shippingCents)}</td><td className="py-2 text-right tabular-nums">{m(order.shippingCents)}</td></tr>}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-72">
        <dl className="grid grid-cols-[1fr_auto] gap-y-1">
          {order.discountCents > 0 && <><dt>Remise {order.discountCode}</dt><dd className="text-right tabular-nums">−{m(order.discountCents)}</dd></>}
          {rate > 0 && <><dt>Total HT</dt><dd className="text-right tabular-nums">{m(gross - tax)}</dd><dt>TVA {rateLabel(rate)}</dt><dd className="text-right tabular-nums">{m(tax)}</dd></>}
          <dt className="border-t-2 border-[#111] pt-1 font-bold">Total TTC</dt><dd className="border-t-2 border-[#111] pt-1 text-right font-bold tabular-nums">{m(gross)}</dd>
          {order.giftCardCents > 0 && <><dt className="text-[#555]">Payé par carte cadeau</dt><dd className="text-right tabular-nums text-[#555]">−{m(order.giftCardCents)}</dd></>}
          <dt className="text-[#555]">{order.paymentStatus === "pending" ? "Reste à payer" : "Payé"}</dt><dd className="text-right tabular-nums text-[#555]">{m(order.totalCents)}</dd>
          {order.refundedCents > 0 && <><dt className="text-[#555]">Remboursé</dt><dd className="text-right tabular-nums text-[#555]">−{m(order.refundedCents)}</dd></>}
        </dl>
      </div>
      <footer className="mt-12 border-t border-[#ddd] pt-3 text-[10px] text-[#777]">
        {rate === 0 && <div className="font-semibold text-[#111]">{FRANCHISE_MENTION}</div>}
        <div>Facture émise par {store.legalName || store.name}. Les prix s'entendent toutes taxes comprises.</div>
      </footer>
    </section>
  );
}

export function PackingSlip({ store, order }: { store: Store; order: FullOrder }) {
  return (
    <section className={sheet}>
      <header className="mb-8 flex justify-between gap-6">
        <div><div className="text-[18px] font-bold">{store.name}</div><div className="text-[#555]">Bon de préparation</div></div>
        <div className="text-right"><div className="text-[22px] font-bold">#{order.number}</div><div className="text-[#555]">{date(order.createdAt)}</div>{order.shippingMethod && <div className="text-[#555]">{order.shippingMethod}</div>}</div>
      </header>
      <div className="mb-8 grid grid-cols-2 gap-6">
        <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#777]">Expédier à</div><div className="text-[14px]"><ShipTo order={order} /></div></div>
        {order.note && <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#777]">Note du client</div><div className="whitespace-pre-line">{order.note}</div></div>}
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead><tr className="border-b-2 border-[#111] text-left"><th className="w-8 py-2" /><th className="py-2">Article</th><th className="py-2 text-right">Quantité</th></tr></thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} className="border-b border-[#ddd]">
              <td className="py-3"><span className="inline-block h-4 w-4 border-2 border-[#111]" /></td>
              <td className="py-3">{i.productTitle}{i.variantTitle !== "Par défaut" ? <span className="text-[#555]"> · {i.variantTitle}</span> : null}</td>
              <td className="py-3 text-right text-[16px] font-bold tabular-nums">{i.quantity - i.refundedQuantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-10 text-center text-[11px] text-[#777]">Merci pour votre commande ! · {store.name}</p>
    </section>
  );
}
