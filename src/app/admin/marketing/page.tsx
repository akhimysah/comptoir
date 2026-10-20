import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { channelOf, visitStats } from "@/lib/traffic";

export default async function MarketingPage() {
  const { store } = await requirePerm("marketing");
  const [campaigns, subscribers, customers] = await Promise.all([
    db.campaign.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" } }),
    db.customer.count({ where: { storeId: store.id, acceptsMarketing: true } }),
    db.customer.count({ where: { storeId: store.id } }),
  ]);
  // Performance par canal sur 30 jours : visites (sessions) par origine, et commandes attribuées à cette origine.
  const since = new Date(Date.now() - 30 * 86400_000);
  const [traffic, attributed] = await Promise.all([
    visitStats(store.id, since, new Date()),
    db.order.findMany({ where: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null, createdAt: { gte: since } }, select: { totalCents: true, refundedCents: true, sessionId: true, referrer: true, utmSource: true, utmMedium: true } }),
  ]);
  const channels = new Map<string, { visits: number; orders: number; cents: number }>();
  const bump = (k: string, f: Partial<{ visits: number; orders: number; cents: number }>) => { const c = channels.get(k) ?? { visits: 0, orders: 0, cents: 0 }; channels.set(k, { visits: c.visits + (f.visits ?? 0), orders: c.orders + (f.orders ?? 0), cents: c.cents + (f.cents ?? 0) }); };
  for (const v of traffic.landings) bump(channelOf(v), { visits: 1 });
  for (const o of attributed) bump(o.sessionId ? channelOf(o) : "Sans mesure (admin, caisse)", { orders: 1, cents: o.totalCents - o.refundedCents });
  const rows = [...channels].sort((a, b) => b[1].cents - a[1].cents || b[1].visits - a[1].visits);
  const totalSales = attributed.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const m = (c: number) => formatMoney(c, store.currency);

  return (
    <>
      <PageHeader title="Marketing" subtitle="Envoyez des e-mails à vos abonnés : nouveautés, soldes, histoire de l'atelier." actions={<><Link href="/admin/marketing/automations" className="btn">Automatisations</Link><Link href="/admin/marketing/new" className="btn btn-primary">Créer une campagne</Link></>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Abonnés à la newsletter</div><div className="text-lg font-bold">{subscribers}</div><div className="text-xs text-muted">sur {customers} client{customers > 1 ? "s" : ""}</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Campagnes envoyées</div><div className="text-lg font-bold">{campaigns.filter((c) => c.status === "sent").length}</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">E-mails envoyés au total</div><div className="text-lg font-bold">{campaigns.reduce((s, c) => s + c.recipients, 0)}</div></div>
      </div>
      <section className="card overflow-hidden">
        <div className="card-h flex-wrap gap-2"><h2 className="text-sm font-[650]">Performance par canal · 30 derniers jours</h2><span className="text-xs text-muted">{m(totalSales)} de ventes · {traffic.visits.toLocaleString("fr-FR")} visites</span></div>
        {rows.length ? (
          <table className="w-full">
            <thead><tr><th className="th">Canal</th><th className="th text-right">Visites</th><th className="th text-right">Commandes</th><th className="th text-right">Taux de conversion</th><th className="th text-right">Ventes</th></tr></thead>
            <tbody>
              {rows.map(([k, c]) => (
                <tr key={k} className="hover:bg-[#f7f7f7]">
                  <td className="td font-[550]">{k}</td>
                  <td className="td num text-right">{c.visits.toLocaleString("fr-FR")}</td>
                  <td className="td num text-right">{c.orders}</td>
                  <td className="td num text-right">{c.visits ? `${(Math.round((c.orders / c.visits) * 10000) / 100).toLocaleString("fr-FR")} %` : "—"}</td>
                  <td className="td num text-right">{m(c.cents)}{totalSales ? <span className="ml-1 text-xs text-muted">({Math.round((c.cents / totalSales) * 100)} %)</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted">Les visites et les ventes par origine (Instagram, Google, e-mail, accès direct…) apparaissent ici dès les premières visites. Ajoutez <code>?utm_source=instagram&amp;utm_campaign=lancement</code> à vos liens pour suivre chaque campagne.</p>
        )}
      </section>
      <p className="text-xs text-muted">Les clients s'inscrivent depuis le pied de page de la boutique ou en cochant la case au moment de commander. Chaque e-mail contient un lien de désabonnement.</p>
      <section className="card overflow-hidden">
        {campaigns.length ? (
          <table className="w-full">
            <thead><tr><th className="th">Campagne</th><th className="th">Statut</th><th className="th text-right">Destinataires</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-[#f7f7f7]">
                  <td className="td"><Link href={`/admin/marketing/${c.id}`} className="font-[550] hover:underline">{c.subject}</Link><div className="text-xs text-muted">{c.sentAt ? `Envoyée le ${formatDate(c.sentAt)}` : `Modifiée le ${formatDate(c.updatedAt)}`}</div></td>
                  <td className="td">{c.status === "sent" ? <Pill tone="ok">Envoyée</Pill> : c.status === "sending" ? <Pill tone="info">Envoi en cours</Pill> : <Pill>Brouillon</Pill>}</td>
                  <td className="td num text-right">{c.status === "sent" ? c.recipients : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Aucune campagne" action={<Link href="/admin/marketing/new" className="btn btn-primary">Créer une campagne</Link>}>Annoncez une nouvelle collection ou une promotion à tous vos abonnés en quelques minutes.</Empty>
        )}
      </section>
    </>
  );
}
