import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { RETURN_STATUS, returnLines } from "@/lib/returns";
import { cx, formatDate } from "@/lib/utils";

const TABS = [
  { key: "", label: "Tous" },
  { key: "requested", label: "À traiter" },
  { key: "approved", label: "En attente du colis" },
  { key: "received", label: "À rembourser" },
  { key: "refunded", label: "Remboursés" },
  { key: "declined", label: "Refusés" },
];

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const { store } = await requirePerm("orders");
  const tab = TABS.some((t) => t.key === status) ? status : "";
  const [returns, counts] = await Promise.all([
    db.returnRequest.findMany({ where: { storeId: store.id, ...(tab ? { status: tab } : {}) }, include: { order: { include: { items: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.returnRequest.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
  ]);
  const count = (k: string) => counts.find((c) => c.status === k)?._count ?? 0;

  return (
    <>
      <PageHeader title="Retours" subtitle={`Vos clients demandent un retour depuis « Mon compte », dans les ${store.returnWindowDays} jours suivant l'expédition. Réglages dans Paramètres.`} />
      <section className="card overflow-hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2" aria-label="Filtrer les retours">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key ? `/admin/orders/returns?status=${t.key}` : "/admin/orders/returns"} aria-current={tab === t.key ? "page" : undefined}
              className={cx("whitespace-nowrap rounded-t-lg px-3 py-2 text-[13px] font-[550]", tab === t.key ? "bg-[#f1f1f1] text-ink" : "text-muted hover:text-ink")}>
              {t.label}{t.key && count(t.key) > 0 ? <span className="ml-1 tabular-nums text-muted">{count(t.key)}</span> : null}
            </Link>
          ))}
        </nav>
        {returns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th">Articles</th><th className="th">Motif</th><th className="th">Statut</th></tr></thead>
              <tbody>
                {returns.map((r) => {
                  const lines = returnLines(r);
                  const st = RETURN_STATUS[r.status as keyof typeof RETURN_STATUS] ?? { label: r.status, tone: "neutral" as const };
                  return (
                    <tr key={r.id} className="hover:bg-[#f7f7f7]">
                      <td className="td"><Link href={`/admin/orders/${r.orderId}`} className="font-[650] hover:underline">#{r.order.number}</Link></td>
                      <td className="td whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="td"><div>{r.order.name}</div><div className="text-xs text-muted">{r.order.email}</div></td>
                      <td className="td">{lines.map((l) => <div key={l.orderItemId} className="truncate">{l.quantity} × {r.order.items.find((i) => i.id === l.orderItemId)?.productTitle ?? "Article"}</div>)}</td>
                      <td className="td text-muted">{[...new Set(lines.map((l) => l.reason))].join(", ")}</td>
                      <td className="td"><Pill tone={st.tone}>{st.label}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={tab ? "Aucun retour dans cette catégorie" : "Aucune demande de retour"}>Quand un client demande un retour depuis son compte, il apparaît ici et vous recevez un e-mail.</Empty>
        )}
      </section>
    </>
  );
}
