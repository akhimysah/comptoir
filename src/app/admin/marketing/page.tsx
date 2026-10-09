import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function MarketingPage() {
  const { store } = await requirePerm("marketing");
  const [campaigns, subscribers, customers] = await Promise.all([
    db.campaign.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" } }),
    db.customer.count({ where: { storeId: store.id, acceptsMarketing: true } }),
    db.customer.count({ where: { storeId: store.id } }),
  ]);
  return (
    <>
      <PageHeader title="Marketing" subtitle="Envoyez des e-mails à vos abonnés : nouveautés, soldes, histoire de l'atelier." actions={<><Link href="/admin/marketing/automations" className="btn">Automatisations</Link><Link href="/admin/marketing/new" className="btn btn-primary">Créer une campagne</Link></>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Abonnés à la newsletter</div><div className="text-lg font-bold">{subscribers}</div><div className="text-xs text-muted">sur {customers} client{customers > 1 ? "s" : ""}</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Campagnes envoyées</div><div className="text-lg font-bold">{campaigns.filter((c) => c.status === "sent").length}</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">E-mails envoyés au total</div><div className="text-lg font-bold">{campaigns.reduce((s, c) => s + c.recipients, 0)}</div></div>
      </div>
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
