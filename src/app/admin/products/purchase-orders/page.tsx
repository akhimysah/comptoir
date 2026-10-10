import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PO_STATUS, poTotal } from "@/lib/purchasing";
import { formatDate } from "@/lib/utils";

export default async function PurchaseOrdersPage() {
  const { store } = await requirePerm("products");
  const pos = await db.purchaseOrder.findMany({ where: { storeId: store.id }, include: { items: true, supplier: true }, orderBy: { number: "desc" } });
  const open = pos.filter((p) => ["ordered", "partial"].includes(p.status));
  const incoming = open.reduce((s, p) => s + p.items.reduce((t, i) => t + Math.max(0, i.quantity - i.received), 0), 0);
  return (
    <>
      <PageHeader back="/admin/products" title="Bons de commande" subtitle="Commandez à vos fournisseurs, puis enregistrez la réception : le stock se met à jour tout seul." actions={<Link href="/admin/products/purchase-orders/new" className="btn btn-primary">Créer un bon de commande</Link>} />
      {open.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="card p-4"><div className="text-xs font-[550] text-muted">Bons en cours</div><div className="text-lg font-bold">{open.length}</div></div>
          <div className="card p-4"><div className="text-xs font-[550] text-muted">Articles à recevoir</div><div className="text-lg font-bold">{incoming}</div></div>
          <div className="card p-4"><div className="text-xs font-[550] text-muted">Montant engagé</div><div className="text-lg font-bold">{formatMoney(open.reduce((s, p) => s + poTotal(p), 0), store.currency)}</div></div>
        </div>
      )}
      <section className="card overflow-hidden">
        {pos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th className="th">Bon</th><th className="th">Fournisseur</th><th className="th">Statut</th><th className="th">Reçu</th><th className="th">Livraison prévue</th><th className="th text-right">Total</th></tr></thead>
              <tbody>
                {pos.map((p) => {
                  const qty = p.items.reduce((s, i) => s + i.quantity, 0);
                  const rec = p.items.reduce((s, i) => s + i.received, 0);
                  const st = PO_STATUS[p.status as keyof typeof PO_STATUS] ?? PO_STATUS.draft;
                  const late = p.expectedAt && p.expectedAt < new Date() && ["ordered", "partial"].includes(p.status);
                  return (
                    <tr key={p.id} className="hover:bg-[#f7f7f7]">
                      <td className="td"><Link href={`/admin/products/purchase-orders/${p.id}`} className="font-[650] hover:underline">n° {p.number}</Link><div className="text-xs text-muted">{formatDate(p.createdAt)}</div></td>
                      <td className="td">{p.supplier?.name ?? <span className="text-muted">—</span>}</td>
                      <td className="td"><Pill tone={st.tone}>{st.label}</Pill></td>
                      <td className="td">
                        <div className="num text-[13px]">{rec} / {qty}</div>
                        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[#ebebeb]"><div className="h-full bg-[#7c3aed]" style={{ width: `${qty ? Math.round((rec / qty) * 100) : 0}%` }} /></div>
                      </td>
                      <td className={`td whitespace-nowrap ${late ? "font-[550] text-[#8e0b21]" : "text-muted"}`}>{p.expectedAt ? `${formatDate(p.expectedAt)}${late ? " · en retard" : ""}` : "—"}</td>
                      <td className="td num text-right">{formatMoney(poTotal(p), store.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aucun bon de commande" action={<Link href="/admin/products/purchase-orders/new" className="btn btn-primary">Créer un bon de commande</Link>}>Préparez vos commandes fournisseurs ici. À la réception, le stock de vos produits augmente automatiquement.</Empty>
        )}
      </section>
    </>
  );
}
