import { choosePlan, openBillingPortal } from "./actions";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { billingEnabled, PLANS, planState, storeFeePercent, trialEnd, type PlanKey } from "@/lib/billing";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Forfait" };

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  active: { label: "Actif", tone: "ok" }, trialing: { label: "Essai", tone: "neutral" }, past_due: { label: "Paiement en retard", tone: "warn" }, canceled: { label: "Résilié", tone: "bad" },
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { store } = await requireOwner();
  const enabled = billingEnabled();
  const state = planState(store);
  const current = state.plan ? (store.plan as PlanKey) : null;

  return (
    <>
      <PageHeader back="/admin/settings" title="Forfait" subtitle="Votre abonnement à Revolution Ecom et la commission prélevée sur vos ventes." />
      {ok && <p role="status" className="mb-4 rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">Merci ! Votre forfait est activé (la confirmation de Stripe peut prendre quelques secondes).</p>}
      {err && <p role="alert" className="mb-4 rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">La facturation n'est pas encore activée sur cette plateforme.</p>}
      {!enabled && <p className="mb-4 rounded-lg bg-[#f1f1f1] px-4 py-3 text-[13px]">Facturation des marchands désactivée : toutes les boutiques vendent librement, avec la commission par défaut ({storeFeePercent(store).toLocaleString("fr-FR")} %). Pour l'activer, configurez la clé Stripe et <code>BILLING_ENABLED=1</code>.</p>}

      <section className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1">
          <div className="text-xs text-muted">Forfait actuel</div>
          <div className="text-lg font-bold">{state.label}</div>
          <div className="text-[13px] text-muted">
            {state.trial
              ? state.daysLeft > 0 ? `${state.daysLeft} jour${state.daysLeft > 1 ? "s" : ""} d'essai restant${state.daysLeft > 1 ? "s" : ""} (jusqu'au ${formatDate(trialEnd(store))}).` : `Essai terminé le ${formatDate(trialEnd(store))} : choisissez un forfait pour continuer à vendre.`
              : store.planRenewsAt ? `${store.planStatus === "canceled" ? "Accès jusqu'au" : "Prochaine échéance le"} ${formatDate(store.planRenewsAt)}.` : ""}
          </div>
        </div>
        {!state.trial && <Pill tone={STATUS[store.planStatus]?.tone ?? "neutral"}>{STATUS[store.planStatus]?.label ?? store.planStatus}</Pill>}
        {enabled && !state.canSell && <Pill tone="bad">Ventes suspendues</Pill>}
        {store.billingCustomerId && <form action={openBillingPortal}><button className="btn">Carte, factures et résiliation</button></form>}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][]).map(([key, p]) => (
          <form key={key} action={choosePlan} className={`card flex flex-col gap-3 p-5 ${current === key ? "ring-2 ring-[#7c3aed]" : ""}`}>
            <input type="hidden" name="plan" value={key} />
            <div className="flex items-center justify-between"><h2 className="text-base font-[650]">{p.name}</h2>{current === key && <Pill tone="ok" dot={false}>Votre forfait</Pill>}</div>
            <div><span className="text-2xl font-bold">{formatMoney(p.priceCents)}</span><span className="text-muted"> / mois</span></div>
            <ul className="flex flex-1 flex-col gap-1.5 text-[13px]">{p.perks.map((x) => <li key={x} className="flex gap-2"><span className="text-[#0c5132]">✓</span>{x}</li>)}</ul>
            <button className={`btn ${current === key ? "" : "btn-primary"}`} disabled={!enabled || (current === key && store.planStatus === "active")}>
              {current === key && store.planStatus === "active" ? "Forfait actuel" : current ? "Changer pour ce forfait" : "Choisir ce forfait"}
            </button>
          </form>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Sans engagement : résiliable à tout moment depuis le portail de facturation ; la boutique reste ouverte jusqu'à la fin du mois payé. En cas de changement de forfait, l'ancien abonnement est arrêté automatiquement.</p>
    </>
  );
}
