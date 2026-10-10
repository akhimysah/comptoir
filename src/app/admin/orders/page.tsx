import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { Empty, PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
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
    case "toship": return { storeId, paymentStatus: { in: ["paid", "partially_refunded"] }, fulfillmentStatus: "unfulfilled", cancelledAt: null };
    case "unpaid": return { storeId, paymentStatus: "pending", cancelledAt: null };
    case "shipped": return { storeId, fulfillmentStatus: "fulfilled", cancelledAt: null };
    case "cancelled": return { storeId, cancelledAt: { not: null } };
    default: return { storeId };
  }
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab = "all", q = "" } = await searchParams;
  const { store } = await requirePerm("orders");
  const counts = await Promise.all(TABS.map((t) => db.order.count({ where: filter(store.id, t.key) })));
  const n = Number(q.replace("#", ""));
  const orders = await db.order.findMany({
    where: { AND: [filter(store.id, tab), q ? { OR: [{ name: textSearch(q) }, { email: textSearch(q) }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])] } : {}] },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Commandes" actions={<><a href="/admin/orders/export" className="btn">Exporter</a><Link href="/admin/orders/new" className="btn btn-primary">Créer une commande</Link></>} />
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
          <OrdersTable
            rows={orders.map((o) => ({
              id: o.id,
              number: o.number,
              date: formatDateTime(o.createdAt),
              name: o.name,
              total: formatMoney(o.totalCents, store.currency),
              payment: o.cancelledAt ? null : PAYMENT_LABELS[o.paymentStatus],
              fulfillment: o.cancelledAt ? null : FULFILLMENT_LABELS[o.fulfillmentStatus],
              items: o.items.reduce((s, i) => s + i.quantity, 0),
              manual: o.paymentMethod === "manual",
            }))}
          />
        ) : (
          <Empty>{counts[0] ? "Aucune commande ne correspond." : "Aucune commande pour l'instant. Elles arrivent ici dès qu'un client paie son panier."}</Empty>
        )}
      </div>
    </>
  );
}
