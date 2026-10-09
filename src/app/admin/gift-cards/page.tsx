import { toggleGiftCard } from "./actions";
import { GiftCardForm } from "@/components/admin/GiftCardForm";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export default async function GiftCardsPage() {
  const { store } = await requirePerm("products");
  const cards = await db.giftCard.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } });
  const m = (c: number) => formatMoney(c, store.currency);
  const now = new Date();
  const outstanding = cards.filter((c) => !c.disabled && (!c.expiresAt || c.expiresAt > now)).reduce((s, c) => s + c.balanceCents, 0);
  return (
    <>
      <PageHeader title="Cartes cadeaux" subtitle={`Solde total encore utilisable : ${m(outstanding)}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card min-w-0 overflow-hidden">
          {cards.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr><th className="th">Code</th><th className="th">Statut</th><th className="th">Destinataire</th><th className="th text-right">Solde</th><th className="th" /></tr></thead>
                <tbody>
                  {cards.map((c) => {
                    const expired = c.expiresAt && c.expiresAt < now;
                    return (
                      <tr key={c.id}>
                        <td className="td"><span className="font-mono">····&nbsp;{c.code.slice(-4)}</span><div className="text-xs text-muted">Créée le {formatDate(c.createdAt)}{c.expiresAt ? ` · expire le ${formatDate(c.expiresAt)}` : ""}</div></td>
                        <td className="td">{c.disabled ? <Pill>Désactivée</Pill> : expired ? <Pill tone="bad">Expirée</Pill> : c.balanceCents === 0 ? <Pill>Épuisée</Pill> : c.balanceCents < c.initialCents ? <Pill tone="info">Utilisée en partie</Pill> : <Pill tone="ok">Active</Pill>}</td>
                        <td className="td text-muted">{c.email || "—"}</td>
                        <td className="td num text-right"><b>{m(c.balanceCents)}</b><span className="text-muted"> / {m(c.initialCents)}</span></td>
                        <td className="td text-right"><form action={toggleGiftCard}><input type="hidden" name="id" value={c.id} /><button className="btn btn-sm">{c.disabled ? "Réactiver" : "Désactiver"}</button></form></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Aucune carte cadeau">Créez une carte d'un montant libre et envoyez-la par e-mail. Le client la saisit dans son panier, et le solde restant reste disponible pour un prochain achat.</Empty>
          )}
        </section>
        <GiftCardForm currency={store.currency} />
      </div>
    </>
  );
}
