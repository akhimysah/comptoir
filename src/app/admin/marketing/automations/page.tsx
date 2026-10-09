import { runNow, saveAutomations } from "./actions";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; ran?: string }> }) {
  const { saved, ran } = await searchParams;
  const { store } = await requirePerm("marketing");
  const [pendingCarts, pendingReviews] = await Promise.all([
    db.checkout.count({ where: { storeId: store.id, orderId: null, remindedAt: null, activityAt: { lt: new Date(Date.now() - store.cartReminderHours * 3600_000), gt: new Date(Date.now() - 7 * 86400_000) } } }),
    db.order.count({ where: { storeId: store.id, fulfillmentStatus: "fulfilled", cancelledAt: null, reviewRequestedAt: null, fulfilledAt: { lt: new Date(Date.now() - store.reviewRequestDays * 86400_000), gt: new Date(Date.now() - 60 * 86400_000) } } }),
  ]);
  const [r1, r2] = (ran ?? "").split("-");
  const box = "card flex flex-col gap-3 p-4";
  return (
    <>
      <PageHeader back="/admin/marketing" title="Automatisations" subtitle="Des e-mails envoyés tout seuls, au bon moment, une seule fois par client." actions={<form action={runNow}><button className="btn">Lancer maintenant</button></form>} />
      {saved && <p role="status" className="card bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Enregistré.</p>}
      {ran && <p role="status" className="card px-4 py-3 text-[13px]">Exécuté : {r1} relance{Number(r1) > 1 ? "s" : ""} de panier, {r2} demande{Number(r2) > 1 ? "s" : ""} d'avis envoyée{Number(r2) > 1 ? "s" : ""}.</p>}
      <form action={saveAutomations} className="flex flex-col gap-4">
        <section className={box}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-[650]">Relance des paniers abandonnés</h2>
            {store.autoCartReminder ? <Pill tone="ok">Active</Pill> : <Pill>Inactive</Pill>}
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="autoCartReminder" defaultChecked={store.autoCartReminder} className="h-4 w-4 accent-[#7c3aed]" />Envoyer automatiquement l'e-mail « Votre panier vous attend »</label>
          <label className="flex items-center gap-2 text-[13px]">après <input name="cartReminderHours" type="number" min={1} max={72} defaultValue={store.cartReminderHours} className="input num h-8 w-20" aria-label="Délai en heures" /> heures sans commande</label>
          <p className="text-xs text-muted">{pendingCarts} panier{pendingCarts > 1 ? "s" : ""} à relancer en ce moment. Le lien de l'e-mail redonne au client son panier complet.</p>
        </section>
        <section className={box}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-[650]">Demande d'avis après la livraison</h2>
            {store.autoReviewRequest ? <Pill tone="ok">Active</Pill> : <Pill>Inactive</Pill>}
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="autoReviewRequest" defaultChecked={store.autoReviewRequest} className="h-4 w-4 accent-[#7c3aed]" />Demander un avis sur les produits achetés</label>
          <label className="flex items-center gap-2 text-[13px]"><input name="reviewRequestDays" type="number" min={1} max={60} defaultValue={store.reviewRequestDays} className="input num h-8 w-20" aria-label="Délai en jours" /> jours après l'expédition</label>
          <p className="text-xs text-muted">{pendingReviews} commande{pendingReviews > 1 ? "s" : ""} concernée{pendingReviews > 1 ? "s" : ""} en ce moment. Les avis reçus arrivent dans Produits → Avis, à publier.</p>
        </section>
        <button className="btn btn-primary self-start">Enregistrer</button>
      </form>
      <p className="text-xs text-muted">Une fois le site en ligne, ces automatisations tournent chaque matin. En local, utilisez « Lancer maintenant ».</p>
    </>
  );
}
