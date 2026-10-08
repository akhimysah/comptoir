import { Empty, PageHeader } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export default async function CustomersPage() {
  const { store } = await requireStore();
  const customers = await db.customer.findMany({
    where: { storeId: store.id },
    include: { orders: { where: { paymentStatus: "paid", cancelledAt: null }, select: { totalCents: true, createdAt: true } } },
  });
  const rows = customers
    .map((c) => ({ ...c, spent: c.orders.reduce((s, o) => s + o.totalCents, 0), last: c.orders.reduce<Date | null>((d, o) => (!d || o.createdAt > d ? o.createdAt : d), null) }))
    .sort((a, b) => b.spent - a.spent);

  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} client${rows.length > 1 ? "s" : ""}`} />
      <div className="card min-w-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Client</th><th className="th">Commandes payées</th><th className="th hidden sm:table-cell">Dernier achat</th><th className="th hidden sm:table-cell">Client depuis</th><th className="th text-right">Total dépensé</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><div className="font-semibold">{c.name}</div><div className="text-xs text-muted">{c.email}</div></td>
                    <td className="td num">{c.orders.length}</td>
                    <td className="td hidden text-muted sm:table-cell">{c.last ? formatDate(c.last) : "—"}</td>
                    <td className="td hidden text-muted sm:table-cell">{formatDate(c.createdAt)}</td>
                    <td className="td num text-right">{formatMoney(c.spent, store.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Vos clients apparaissent ici après leur première commande.</Empty>
        )}
      </div>
    </>
  );
}
