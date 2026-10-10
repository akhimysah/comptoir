import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print/PrintButton";
import { requireUser, storesWithPerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { poTotal } from "@/lib/purchasing";

export const metadata = { title: "Bon de commande" };

export default async function PrintPurchaseOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const stores = await storesWithPerm(user.id, "products");
  const po = await db.purchaseOrder.findFirst({ where: { id, storeId: { in: stores.map((s) => s.id) } }, include: { items: true, supplier: true, store: true } });
  if (!po) notFound();
  const m = (c: number) => formatMoney(c, po.store.currency);
  const d = (x: Date) => x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden"><PrintButton label="Imprimer" /></div>
      <section className="sheet mx-auto max-w-[210mm] bg-white p-10 text-[12px] shadow-[0_2px_12px_rgba(0,0,0,.15)]">
        <div className="flex justify-between gap-8">
          <div>
            <div className="text-[18px] font-bold">{po.store.legalName || po.store.name}</div>
            {po.store.legalAddress && <div className="whitespace-pre-line text-[#555]">{po.store.legalAddress}</div>}
            {po.store.siret && <div className="text-[#555]">SIRET {po.store.siret}</div>}
          </div>
          <div className="text-right">
            <div className="text-[18px] font-bold">Bon de commande n° {po.number}</div>
            <div className="text-[#555]">{d(po.orderedAt ?? po.createdAt)}</div>
            {po.expectedAt && <div className="text-[#555]">Livraison souhaitée : {d(po.expectedAt)}</div>}
          </div>
        </div>
        {po.supplier && (
          <div className="mt-8"><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#777]">Fournisseur</div><div>{po.supplier.name}</div>{po.supplier.email && <div className="text-[#555]">{po.supplier.email}</div>}{po.supplier.address && <div className="whitespace-pre-line text-[#555]">{po.supplier.address}</div>}</div>
        )}
        <table className="mt-8 w-full border-collapse">
          <thead><tr className="border-b-2 border-black text-left"><th className="py-2">Article</th><th className="py-2">Réf.</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">Prix unitaire</th><th className="py-2 text-right">Total</th></tr></thead>
          <tbody>
            {po.items.map((i) => (
              <tr key={i.id} className="border-b border-[#ddd]">
                <td className="py-2">{i.productTitle}{i.variantTitle !== "Par défaut" ? ` · ${i.variantTitle}` : ""}</td>
                <td className="py-2 text-[#555]">{i.sku}</td>
                <td className="py-2 text-right">{i.quantity}</td>
                <td className="py-2 text-right">{m(i.costCents)}</td>
                <td className="py-2 text-right">{m(i.costCents * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-64">
          {po.shippingCents > 0 && <div className="flex justify-between py-1"><span>Frais de port</span><span>{m(po.shippingCents)}</span></div>}
          <div className="flex justify-between border-t-2 border-black py-2 text-[14px] font-bold"><span>Total</span><span>{m(poTotal(po))}</span></div>
        </div>
        {po.note && <p className="mt-6 whitespace-pre-line text-[#555]">{po.note}</p>}
      </section>
    </>
  );
}
