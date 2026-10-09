import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print/PrintButton";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FRANCHISE_MENTION, rateLabel } from "@/lib/tax";

export const metadata = { title: "Ticket de caisse" };

/** Ticket de caisse au format imprimante thermique 80 mm. */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await db.order.findUnique({ where: { id }, include: { items: true, store: true } });
  if (!o) notFound();
  const m = (c: number) => formatMoney(c, o.store.currency);
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 4mm }`}</style>
      <div className="mx-auto mb-4 flex w-[80mm] justify-end print:hidden"><PrintButton label="Imprimer" /></div>
      <section className="sheet mx-auto w-[80mm] bg-white p-4 font-mono text-[11px] leading-snug shadow-[0_2px_12px_rgba(0,0,0,.15)]">
        <div className="text-center">
          <div className="text-[14px] font-bold">{o.store.legalName || o.store.name}</div>
          {o.store.legalAddress && <div className="whitespace-pre-line">{o.store.legalAddress}</div>}
          {o.store.siret && <div>SIRET {o.store.siret}</div>}
          <div className="mt-2">Ticket n° {o.number} · {o.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        {o.items.map((i) => (
          <div key={i.id} className="flex justify-between gap-2">
            <span>{i.quantity} × {i.productTitle}{i.variantTitle !== "Par défaut" ? ` ${i.variantTitle}` : ""}</span>
            <span>{m(i.priceCents * i.quantity)}</span>
          </div>
        ))}
        <div className="my-2 border-t border-dashed border-black" />
        {o.discountCents > 0 && <div className="flex justify-between"><span>Remise</span><span>−{m(o.discountCents)}</span></div>}
        <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{m(o.totalCents)}</span></div>
        {o.taxRateBps > 0 ? <div className="flex justify-between"><span>dont TVA {rateLabel(o.taxRateBps)}</span><span>{m(o.taxCents)}</span></div> : <div>{FRANCHISE_MENTION}</div>}
        <div className="flex justify-between"><span>Payé</span><span>{o.paymentMethod === "pos_cash" ? "Espèces" : o.paymentMethod === "pos_card" ? "Carte" : "En ligne"}</span></div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center">Merci de votre visite !</div>
      </section>
    </>
  );
}
