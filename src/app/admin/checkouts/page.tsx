import { deleteCheckout, sendReminder } from "./actions";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime, parseJson } from "@/lib/utils";

const DELAY_MIN = 30; // un panier est « abandonné » après 30 minutes sans commande

export default async function CheckoutsPage() {
  const { store } = await requirePerm("orders");
  const before = new Date(Date.now() - DELAY_MIN * 60_000);
  const [abandoned, recovered] = await Promise.all([
    db.checkout.findMany({ where: { storeId: store.id, orderId: null, activityAt: { lt: before } }, orderBy: { activityAt: "desc" }, take: 200 }),
    db.checkout.findMany({ where: { storeId: store.id, recoveredAt: { not: null } }, select: { totalCents: true } }),
  ]);
  const m = (c: number) => formatMoney(c, store.currency);
  const lost = abandoned.reduce((s, c) => s + c.totalCents, 0);

  return (
    <>
      <PageHeader title="Paniers abandonnés" subtitle={`Clients qui ont saisi leur e-mail sans terminer leur commande depuis plus de ${DELAY_MIN} minutes.`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Paniers abandonnés", String(abandoned.length)],
          ["Montant en attente", m(lost)],
          ["Récupérés après relance", `${recovered.length} · ${m(recovered.reduce((s, c) => s + c.totalCents, 0))}`],
        ].map(([k, v]) => <div key={k} className="card p-4"><div className="text-xs font-[550] text-muted">{k}</div><div className="text-lg font-bold tabular-nums">{v}</div></div>)}
      </div>
      <section className="card overflow-hidden">
        {abandoned.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th className="th">Client</th><th className="th">Date</th><th className="th">Articles</th><th className="th">Relance</th><th className="th text-right">Montant</th><th className="th" /></tr></thead>
              <tbody>
                {abandoned.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f7f7f7]">
                    <td className="td"><div className="font-[550]">{c.name || c.email}</div>{c.name && <div className="text-xs text-muted">{c.email}</div>}</td>
                    <td className="td whitespace-nowrap text-muted">{formatDateTime(c.activityAt)}</td>
                    <td className="td num">{parseJson<{ quantity: number }[]>(c.items, []).reduce((s, i) => s + i.quantity, 0)}</td>
                    <td className="td">{c.remindedAt ? <Pill tone="info">Envoyée le {formatDateTime(c.remindedAt)}</Pill> : <Pill tone="attention">Pas encore relancé</Pill>}</td>
                    <td className="td num text-right">{m(c.totalCents)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        <form action={sendReminder}><input type="hidden" name="id" value={c.id} /><button className="btn btn-sm">{c.remindedAt ? "Relancer à nouveau" : "Envoyer une relance"}</button></form>
                        <form action={deleteCheckout}><input type="hidden" name="id" value={c.id} /><button className="btn btn-sm" aria-label="Supprimer">✕</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aucun panier abandonné">Quand un client saisit son e-mail dans le panier sans commander, il apparaît ici et vous pouvez lui envoyer un rappel avec un lien qui retrouve son panier.</Empty>
        )}
      </section>
    </>
  );
}
