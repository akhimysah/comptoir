import Link from "next/link";
import { createFromTemplate } from "./actions";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { applySegment, customerStats, SEGMENT_TEMPLATES, segmentRules } from "@/lib/segments";
import { describeRule } from "@/lib/segment-fields";
import { formatDate } from "@/lib/utils";

export default async function SegmentsPage() {
  const { store } = await requirePerm("customers");
  const [segments, stats, products] = await Promise.all([
    db.segment.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } }),
    customerStats(store.id),
    db.product.findMany({ where: { storeId: store.id }, select: { id: true, title: true } }),
  ]);
  const title = (id: string) => products.find((p) => p.id === id)?.title;
  const unused = SEGMENT_TEMPLATES.map((t, i) => ({ ...t, i })).filter((t) => !segments.some((s) => s.name === t.name));
  return (
    <>
      <PageHeader back="/admin/customers" title="Segments" subtitle="Des groupes de clients mis à jour automatiquement, à cibler dans vos campagnes e-mail." actions={<Link href="/admin/customers/segments/new" className="btn btn-primary">Créer un segment</Link>} />
      <section className="card overflow-hidden">
        {segments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead><tr><th className="th">Segment</th><th className="th">Conditions</th><th className="th text-right">Clients</th><th className="th">Modifié</th></tr></thead>
              <tbody>
                {segments.map((s) => {
                  const rules = segmentRules(s);
                  return (
                    <tr key={s.id} className="hover:bg-[#f7f7f7]">
                      <td className="td"><Link href={`/admin/customers?segment=${s.id}`} className="font-[650] hover:underline">{s.name}</Link></td>
                      <td className="td text-[13px] text-muted">{rules.length ? rules.map((r) => describeRule(r, store.currency, title(r.value))).join(s.match === "all" ? " et " : " ou ") : "Tous les clients"}</td>
                      <td className="td num text-right">{applySegment(stats, s.match, rules).length}</td>
                      <td className="td whitespace-nowrap text-muted"><Link href={`/admin/customers/segments/${s.id}`} className="text-pine hover:underline">Modifier</Link> · {formatDate(s.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-muted">Aucun segment pour le moment. Partez d'un modèle ci-dessous ou créez le vôtre.</p>
        )}
      </section>
      {unused.length > 0 && (
        <section className="card mt-4 overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Modèles</h2></div>
          <ul className="grid sm:grid-cols-2">
            {unused.map((t) => (
              <li key={t.i} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:odd:border-r">
                <div><div className="font-[550]">{t.name}</div><div className="text-xs text-muted">{t.rules.map((r) => describeRule(r, store.currency)).join(" et ")} · {applySegment(stats, t.match, t.rules).length} client(s)</div></div>
                <form action={createFromTemplate}><input type="hidden" name="index" value={t.i} /><button className="btn">Utiliser</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
