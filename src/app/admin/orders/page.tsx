import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/orders";
import { cx, formatDateTime } from "@/lib/utils";

const TABS = [
  { key: "all", label: "Toutes" },
  { key: "toship", label: "Non traitées" },
  { key: "unpaid", label: "Non payées" },
  { key: "shipped", label: "Traitées" },
  { key: "cancelled", label: "Annulées" },
] as const;

function filter(storeId: string, tab: string): Prisma.OrderWhereInput {
  switch (tab) {
    case "toship": return { storeId, paymentStatus: "paid", fulfillmentStatus: "unfulfilled", cancelledAt: null };
    case "unpaid": return { storeId, paymentStatus: "pending", cancelledAt: null };
    case "shipped": return { storeId, fulfillmentStatus: "fulfilled", cancelledAt: null };
    case "cancelled": return { storeId, cancelledAt: { not: null } };
    default: return { storeId };
  }
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab = "all", q = "" } = await searchParams;
  const { store } = await requireStore();
  const counts = await Promise.all(TABS.map((t) => db.order.count({ where: filter(store.id, t.key) })));
  const n = Number(q.replace("#", ""));
  const orders = await db.order.findMany({
    where: { AND: [filter(store.id, tab), q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])] } : {}] },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Commandes" />
      <div className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          {TABS.map((t, i) => (
            <Link key={t.key} href={`/admin/orders?tab=${t.key}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", tab === t.key ? "bg-[#e3e3e3] text-ink" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>
              {t.label}{t.key !== "all" && counts[i] > 0 && <span className="ml-1 text-xs tabular-nums text-muted">{counts[i]}</span>}
            </Link>
          ))}
          <form className="ml-auto flex items-center gap-1.5">
            <input type="hidden" name="tab" value={tab} />
            <input name="q" defaultValue={q} className="input h-7 w-48 py-1" placeholder="Rechercher n°, nom, e-mail" aria-label="Rechercher une commande" />
          </form>
        </div>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th w-8"><input type="checkbox" aria-label="Tout sélectionner" className="h-4 w-4 accent-[#303030]" /></th><th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th text-right">Total</th><th className="th">Statut du paiement</th><th className="th">Statut du traitement</th><th className="th hidden md:table-cell">Articles</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#f7f7f7]">
                    <td className="td"><input type="checkbox" aria-label={`Sélectionner #${o.number}`} className="h-4 w-4 accent-[#303030]" /></td>
                    <td className="td"><Link href={`/admin/orders/${o.id}`} className="font-[650] hover:underline">#{o.number}</Link></td>
                    <td className="td whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</td>
                    <td className="td">{o.name}</td>
                    <td className="td num whitespace-nowrap text-right">{formatMoney(o.totalCents, store.currency)}</td>
                    <td className="td">{o.cancelledAt ? <Pill>Annulée</Pill> : <Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill>}</td>
                    <td className="td">{!o.cancelledAt && <Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill>}</td>
                    <td className="td num hidden text-muted md:table-cell">{o.items.reduce((s, i) => s + i.quantity, 0)} article{o.items.reduce((s, i) => s + i.quantity, 0) > 1 ? "s" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{counts[0] ? "Aucune commande ne correspond." : "Aucune commande pour l'instant. Elles arrivent ici dès qu'un client paie son panier."}</Empty>
        )}
      </div>
    </>
  );
}
