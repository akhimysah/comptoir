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
  { key: "toship", label: "À expédier" },
  { key: "unpaid", label: "Paiement en attente" },
  { key: "shipped", label: "Expédiées" },
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
    where: { AND: [filter(store.id, tab), q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])] } : {}] },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Commandes" subtitle="De la commande à l'expédition." />
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t, i) => (
          <Link key={t.key} href={`/admin/orders?tab=${t.key}`} className={cx("rounded-full border px-3 py-1.5 text-sm", tab === t.key ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-[#F3F6F4]")}>
            {t.label} <span className="ml-1 font-mono text-xs opacity-70">{counts[i]}</span>
          </Link>
        ))}
      </div>
      <div className="card min-w-0">
        <form className="card-h"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={q} className="input max-w-xs" placeholder="N°, nom ou e-mail" aria-label="Rechercher une commande" /><button className="btn">Rechercher</button></form>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th">Paiement</th><th className="th">Expédition</th><th className="th hidden md:table-cell">Articles</th><th className="th text-right">Total</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#F3F6F4]">
                    <td className="td"><Link href={`/admin/orders/${o.id}`} className="num font-semibold text-pine">#{o.number}</Link></td>
                    <td className="td whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</td>
                    <td className="td">{o.name}<div className="text-xs text-muted">{o.email}</div></td>
                    <td className="td">{o.cancelledAt ? <Pill tone="bad">Annulée</Pill> : <Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill>}</td>
                    <td className="td">{!o.cancelledAt && o.paymentStatus === "paid" ? <Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill> : <span className="text-muted">—</span>}</td>
                    <td className="td num hidden md:table-cell">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                    <td className="td num text-right">{formatMoney(o.totalCents, store.currency)}</td>
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
