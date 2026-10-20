import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { isTestMode, stripeConfigured } from "@/lib/stripe";
import { MANUAL_DEFAULTS, MAX_CUSTOM_PAYMENTS, readManualPayments } from "@/lib/checkout-settings";
import { saveManualPayments, saveStoreCredit } from "./actions";

const ERRORS: Record<string, string> = {
  stripe: "Stripe a refusé la demande. Vérifiez la clé secrète et que Connect est activé sur votre compte Stripe.",
  config: "Ajoutez d'abord STRIPE_SECRET_KEY dans le fichier .env, puis redémarrez le serveur.",
};

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ stripe?: string; ok?: string; err?: string }> }) {
  const { stripe, ok, err } = await searchParams;
  const { store } = await requireOwner();
  const configured = stripeConfigured();
  const saved = readManualPayments(store.manualPayments);
  const bank = saved.find((m) => m.key === "bank_transfer") ?? { ...MANUAL_DEFAULTS.bank_transfer, enabled: false };
  const cod = saved.find((m) => m.key === "cod") ?? { ...MANUAL_DEFAULTS.cod, enabled: false };
  const customs = saved.filter((m) => m.key === "custom");

  return (
    <>
      <PageHeader back="/admin/settings" title="Paiements" subtitle="Comment vos clients vous paient : par carte via Stripe, ou par un moyen manuel que vous encaissez vous-même." />
      {ok && <p role="status" className="card mb-4 bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Moyens de paiement enregistrés.</p>}
      {err && <p role="alert" className="card mb-4 bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{err}</p>}
      <div className="flex max-w-3xl flex-col gap-4">
        <section id="paiements" className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-[650]">Carte bancaire (Stripe)</h2>
            {store.stripeChargesEnabled ? <Pill tone="ok">Carte bancaire activée</Pill> : store.stripeAccountId ? <Pill tone="warn">Inscription à terminer</Pill> : <Pill>Démonstration</Pill>}
          </div>
          {stripe && ERRORS[stripe] && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORS[stripe]}</p>}
          {stripe === "done" && !store.stripeChargesEnabled && <p className="rounded-lg bg-[#FAEAC6] px-3 py-2 text-sm text-[#8F5B00]">Stripe n'a pas encore validé votre compte. Terminez les étapes demandées, puis revenez ici.</p>}
          {store.stripeChargesEnabled ? (
            <p className="text-sm text-muted">Vos clients paient par carte, Apple Pay ou Google Pay. L'argent est versé sur votre compte Stripe, moins la commission de la plateforme ({process.env.PLATFORM_FEE_PERCENT ?? "2"} %).</p>
          ) : (
            <p className="text-sm text-muted">Connectez un compte Stripe pour encaisser par carte. Stripe vous demandera votre identité et votre IBAN pour les virements. En attendant, les commandes passent en paiement de démonstration.</p>
          )}
          {configured ? (
            <a href="/api/stripe/connect" className={store.stripeChargesEnabled ? "btn self-start" : "btn btn-primary self-start"}>
              {store.stripeChargesEnabled ? "Ouvrir mon tableau de bord Stripe" : store.stripeAccountId ? "Terminer l'inscription Stripe" : "Connecter Stripe"}
            </a>
          ) : (
            <p className="rounded-lg bg-[#ebebeb] px-3 py-2 text-xs text-muted">La plateforme n'a pas encore de clé Stripe. Voir le README, section « Activer Stripe ».</p>
          )}
          {configured && isTestMode() && <p className="text-xs text-muted">Mode test Stripe : aucun argent réel ne circule. Carte de test : 4242 4242 4242 4242.</p>}
        </section>

        <form action={saveManualPayments} id="manuels" className="card flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-sm font-[650]">Moyens de paiement manuels</h2>
            <p className="mt-1 text-xs text-muted">Le client choisit ce moyen au moment de commander ; la commande est enregistrée « en attente de paiement » et il reçoit vos consignes. Dès que vous avez l'argent, marquez la commande comme payée depuis sa fiche.</p>
          </div>
          {([["bank_transfer", bank], ["cod", cod]] as const).map(([key, m]) => (
            <fieldset key={key} className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <label className="flex items-center gap-2 text-[13px] font-[550]"><input type="checkbox" name={`${key}_enabled`} defaultChecked={m.enabled} className="h-4 w-4 accent-[#7c3aed]" />{MANUAL_DEFAULTS[key].name}</label>
              <label className="label">Nom affiché au client<input name={`${key}_name`} defaultValue={m.name} maxLength={60} className="input" /></label>
              <label className="label">Consignes de paiement<span className="hint">Affichées sur la page de confirmation et conservées dans la commande.</span><textarea name={`${key}_instructions`} rows={4} maxLength={2000} defaultValue={m.instructions} className="input" /></label>
            </fieldset>
          ))}
          <div>
            <h3 className="text-[13px] font-[550]">Moyens personnalisés</h3>
            <p className="text-xs text-muted">Jusqu'à {MAX_CUSTOM_PAYMENTS} : chèque, paiement en boutique, PayPal par e-mail… Laissez vide pour ne pas en proposer.</p>
          </div>
          {Array.from({ length: MAX_CUSTOM_PAYMENTS }, (_, i) => customs[i] ?? { name: "", instructions: "", enabled: false }).map((m, i) => (
            <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <label className="flex items-center gap-2 text-[13px] font-[550]"><input type="checkbox" name={`custom${i}_enabled`} defaultChecked={m.enabled} className="h-4 w-4 accent-[#7c3aed]" />Moyen personnalisé {i + 1}</label>
              <label className="label">Nom affiché au client<input name={`custom${i}_name`} defaultValue={m.name} maxLength={60} placeholder="Chèque" className="input" /></label>
              <label className="label">Consignes de paiement<textarea name={`custom${i}_instructions`} rows={3} maxLength={2000} defaultValue={m.instructions} placeholder="Envoyez un chèque à l'ordre de … à l'adresse …" className="input" /></label>
            </fieldset>
          ))}
          <button className="btn btn-primary self-end">Enregistrer</button>
        </form>
        <form action={saveStoreCredit} id="credit" className="card flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-[650]">Crédit en magasin</h2>{store.storeCreditEnabled ? <Pill tone="ok">Activé</Pill> : <Pill>Désactivé</Pill>}</div>
          <p className="text-sm text-muted">Un solde par client, que vous créditez depuis sa fiche (geste commercial) ou en choisissant « Rembourser en crédit en magasin » lors d'un remboursement. Le client le voit dans « Mon compte » et il est déduit automatiquement de sa prochaine commande.</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="enabled" defaultChecked={store.storeCreditEnabled} className="h-4 w-4 accent-[#7c3aed]" />Activer le crédit en magasin</label>
          <button className="btn btn-primary self-end">Enregistrer</button>
        </form>
      </div>
    </>
  );
}
