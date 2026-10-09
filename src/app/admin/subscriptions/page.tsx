import Link from "next/link";
import { changeSubscription, renewNow } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

const STATUS = { active: { label: "Actif", tone: "ok" }, paused: { label: "En pause", tone: "attention" }, cancelled: { label: "Résilié", tone: "neutral" } } as const;

export default async function SubscriptionsPage() {
  const { store } = await requirePerm("orders");
  const subs = await db.subscription.findMany({ where: { storeId: store.id }, orderBy: [{ status: "asc" }, { nextBillingAt: "asc" }] });
  const m = (c: number) => formatMoney(c, store.currency);
  const active = subs.filter((s) => s.status === "active");
  // Revenu mensuel récurrent : un abonnement hebdomadaire compte 52/12 échéances par mois.
  const mrr = active.reduce((t, s) => t + s.priceCents * s.quantity * (s.interval === "week" ? 52 / 12 : 1), 0);
  return (
    <>
      <PageHeader title="Abonnements" subtitle="Les produits livrés régulièrement. Une commande est créée à chaque échéance." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Abonnements actifs</div><div className="text-lg font-bold">{active.length}</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Revenu mensuel récurrent</div><div className="text-lg font-bold">{m(Math.round(mrr))}</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">En pause ou résiliés</div><div className="text-lg font-bold">{subs.length - active.length}</div></div>
      </div>
      <section className="card overflow-hidden">
        {subs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr><th className="th">Client</th><th className="th">Produit</th><th className="th">Statut</th><th className="th">Prochaine échéance</th><th className="th text-right">Montant</th><th className="th" /></tr></thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="hover:bg-[#f7f7f7]">
                    <td className="td"><div className="font-[550]">{s.name}</div><div className="text-xs text-muted">{s.email}</div></td>
                    <td className="td">{s.quantity} × {s.productTitle}{s.variantTitle !== "Par défaut" ? ` · ${s.variantTitle}` : ""}<div className="text-xs text-muted">{s.interval === "week" ? "Chaque semaine" : "Chaque mois"} · {s.ordersCount} livraison{s.ordersCount > 1 ? "s" : ""}{s.stripeSubscriptionId ? " · Stripe" : ""}{s.firstOrderId && <> · <Link href={`/admin/orders/${s.firstOrderId}`} className="text-pine hover:underline">1re commande</Link></>}</div></td>
                    <td className="td"><Pill tone={STATUS[s.status as keyof typeof STATUS]?.tone ?? "neutral"}>{STATUS[s.status as keyof typeof STATUS]?.label ?? s.status}</Pill></td>
                    <td className="td whitespace-nowrap">{s.status === "cancelled" ? "—" : formatDate(s.nextBillingAt)}</td>
                    <td className="td num text-right">{m(s.priceCents * s.quantity)}</td>
                    <td className="td">
                      {s.status !== "cancelled" && (
                        <div className="flex justify-end gap-1.5">
                          {s.status === "active" && !s.stripeSubscriptionId && <form action={renewNow}><input type="hidden" name="id" value={s.id} /><button className="btn btn-sm">Créer l'échéance</button></form>}
                          <form action={changeSubscription}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value={s.status === "active" ? "paused" : "active"} /><button className="btn btn-sm">{s.status === "active" ? "Pause" : "Reprendre"}</button></form>
                          <form action={changeSubscription}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="cancelled" /><ConfirmSubmit label="Résilier" confirmLabel="Confirmer" className="btn-sm" /></form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aucun abonnement">Proposez un abonnement sur une fiche produit (section « Abonnement ») : vos clients pourront le choisir à la place d'un achat unique.</Empty>
        )}
      </section>
    </>
  );
}
