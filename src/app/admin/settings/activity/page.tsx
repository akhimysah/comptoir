import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, initials } from "@/lib/utils";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { who } = await searchParams;
  const { store } = await requireOwner();
  const [logs, people] = await Promise.all([
    db.activityLog.findMany({ where: { storeId: store.id, ...(who ? { userId: who } : {}) }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.activityLog.groupBy({ by: ["userId", "userName"], where: { storeId: store.id }, _count: true }),
  ]);
  // Regroupement par jour, comme dans Shopify.
  const days = new Map<string, typeof logs>();
  for (const l of logs) {
    const k = l.createdAt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    days.set(k, [...(days.get(k) ?? []), l]);
  }
  return (
    <>
      <PageHeader back="/admin/settings" title="Journal d'activité" subtitle="Les actions faites dans l'admin de cette boutique, par vous et votre équipe." />
      {people.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Link href="/admin/settings/activity" className={`btn ${!who ? "bg-[#e3e3e3]" : ""}`}>Tout le monde</Link>
          {people.map((p) => <Link key={p.userId ?? p.userName} href={`/admin/settings/activity?who=${p.userId}`} className={`btn ${who === p.userId ? "bg-[#e3e3e3]" : ""}`}>{p.userName} <span className="text-xs text-muted">{p._count}</span></Link>)}
        </div>
      )}
      {logs.length ? (
        [...days.entries()].map(([day, list]) => (
          <section key={day} className="card overflow-hidden">
            <div className="card-h"><h2 className="text-sm font-[650] first-letter:uppercase">{day}</h2></div>
            <ul>
              {list.map((l) => (
                <li key={l.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#c4b5fd] text-[10px] font-semibold text-[#2e1065]">{initials(l.userName)}</span>
                  <span className="min-w-0 flex-1"><b className="font-[550]">{l.userName}</b> · {l.url ? <Link href={l.url} className="hover:underline">{l.action}</Link> : l.action}</span>
                  <time className="shrink-0 text-xs text-muted">{formatDateTime(l.createdAt).split(" ").pop()}</time>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="card"><Empty>Rien pour l'instant. Les modifications de produits, commandes, remises, paramètres et thème apparaîtront ici.</Empty></div>
      )}
    </>
  );
}
