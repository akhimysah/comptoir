import { deleteDiscount, toggleDiscount } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export default async function DiscountsPage() {
  const { store } = await requireStore();
  const discounts = await db.discount.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } });
  const now = new Date();
  return (
    <>
      <PageHeader title="Remises" subtitle="Codes promo à saisir dans le panier, ou remises automatiques appliquées sans code." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="card min-w-0">
          {discounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Remise</th><th className="th">Réduction</th><th className="th">Utilisations</th><th className="th">Statut</th><th className="th" /></tr></thead>
                <tbody>
                  {discounts.map((d) => {
                    const expired = d.endsAt && d.endsAt < now;
                    const exhausted = d.usageLimit !== null && d.usageCount >= d.usageLimit;
                    return (
                      <tr key={d.id}>
                        <td className="td">{d.automatic ? <><div className="font-[550]">{d.title}</div><Pill tone="info" dot={false}>Automatique</Pill></> : <span className="font-mono font-[650]">{d.code}</span>}</td>
                        <td className="td">
                          {d.type === "free_shipping" ? "Livraison offerte" : d.type === "percent" ? `${d.value} %` : formatMoney(d.value, store.currency)}
                          {d.minSubtotalCents > 0 && <div className="text-xs text-muted">dès {formatMoney(d.minSubtotalCents, store.currency)}</div>}
                          {d.endsAt && <div className="text-xs text-muted">jusqu'au {formatDate(d.endsAt)}</div>}
                        </td>
                        <td className="td num">{d.usageCount}{d.usageLimit !== null && <span className="text-muted"> / {d.usageLimit}</span>}</td>
                        <td className="td">{!d.active ? <Pill>Désactivé</Pill> : expired ? <Pill tone="bad">Expiré</Pill> : exhausted ? <Pill tone="warn">Épuisé</Pill> : <Pill tone="ok">Actif</Pill>}</td>
                        <td className="td">
                          <div className="flex justify-end gap-2">
                            <form action={toggleDiscount}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm">{d.active ? "Désactiver" : "Activer"}</button></form>
                            <form action={deleteDiscount}><input type="hidden" name="id" value={d.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" className="btn-sm" /></form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Aucun code promo">Créez un code comme BIENVENUE10 pour offrir 10 % sur la première commande.</Empty>
          )}
        </div>
        <DiscountForm currency={store.currency} />
      </div>
    </>
  );
}
