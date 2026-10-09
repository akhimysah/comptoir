import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { describeRule } from "@/lib/segment-fields";
import { applySegment, customerStats, segmentRules } from "@/lib/segments";
import { cx, formatDate } from "@/lib/utils";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ segment?: string; tag?: string }> }) {
  const { segment: segmentId, tag } = await searchParams;
  const { store } = await requirePerm("customers");
  const [stats, segments] = await Promise.all([customerStats(store.id), db.segment.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } })]);
  const segment = segments.find((s) => s.id === segmentId);
  let rows = segment ? applySegment(stats, segment.match, segmentRules(segment)) : stats;
  if (tag) rows = rows.filter((c) => c.tags.includes(tag.toLowerCase()));
  rows = [...rows].sort((a, b) => b.spent - a.spent);
  const spent = rows.reduce((s, c) => s + c.spent, 0);
  const pct = stats.length ? Math.round((rows.length / stats.length) * 100) : 0;
  const chip = (on: boolean) => cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-[550]", on ? "bg-[#ebebeb] text-ink" : "text-muted hover:bg-[#f1f1f1] hover:text-ink");

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client${rows.length > 1 ? "s" : ""}${segment || tag ? ` · ${pct} % de votre clientèle · ${formatMoney(spent, store.currency)} dépensés` : ""}`}
        actions={<><Link href="/admin/customers/segments" className="btn">Segments</Link><Link href={segment ? `/admin/customers/segments/${segment.id}` : "/admin/customers/segments/new"} className="btn btn-primary">{segment ? "Modifier le segment" : "Créer un segment"}</Link></>}
      />
      <nav className="mb-3 flex gap-1 overflow-x-auto" aria-label="Segments">
        <Link href="/admin/customers" className={chip(!segment && !tag)} aria-current={!segment && !tag ? "page" : undefined}>Tous les clients</Link>
        {segments.map((s) => <Link key={s.id} href={`/admin/customers?segment=${s.id}`} className={chip(s.id === segment?.id)} aria-current={s.id === segment?.id ? "page" : undefined}>{s.name}</Link>)}
        {tag && <span className={chip(true)}>Étiquette : {tag} <Link href={segment ? `/admin/customers?segment=${segment.id}` : "/admin/customers"} aria-label="Retirer le filtre" className="ml-1 text-muted">✕</Link></span>}
      </nav>
      {segment && segmentRules(segment).length > 0 && (
        <p className="mb-3 text-[13px] text-muted">{segmentRules(segment).map((r) => describeRule(r, store.currency)).join(segment.match === "all" ? " et " : " ou ")}</p>
      )}
      <div className="card min-w-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Client</th><th className="th">Commandes</th><th className="th hidden sm:table-cell">Dernier achat</th><th className="th hidden md:table-cell">Pays</th><th className="th text-right">Total dépensé</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f7f7f7]">
                    <td className="td">
                      <Link href={`/admin/customers/${c.id}`} className="font-[650] hover:underline">{c.name}</Link>
                      {c.acceptsMarketing && <span className="ml-2 rounded-md bg-[#e0f0ff] px-1.5 text-[11px] font-[550] text-[#00527c]">Abonné</span>}
                      <div className="text-xs text-muted">{c.email}</div>
                      {c.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.tags.map((t) => <Link key={t} href={`/admin/customers?${segment ? `segment=${segment.id}&` : ""}tag=${encodeURIComponent(t)}`} className="rounded-md bg-[#ebebeb] px-1.5 text-[11px] font-[550] hover:bg-[#e3e3e3]">{t}</Link>)}
                        </div>
                      )}
                    </td>
                    <td className="td num">{c.orders}</td>
                    <td className="td hidden text-muted sm:table-cell">{c.last ? formatDate(c.last) : "—"}</td>
                    <td className="td hidden text-muted md:table-cell">{c.country || "—"}</td>
                    <td className="td num text-right">{formatMoney(c.spent, store.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{segment || tag ? "Aucun client ne correspond pour le moment." : "Vos clients apparaissent ici après leur première commande."}</Empty>
        )}
      </div>
    </>
  );
}
