import { SettingsForm } from "@/components/admin/SettingsForm";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import Link from "next/link";
import { centsToInput } from "@/lib/money";
import { isTestMode, stripeConfigured } from "@/lib/stripe";

const ERRORS: Record<string, string> = {
  stripe: "Stripe a refusé la demande. Vérifiez la clé secrète et que Connect est activé sur votre compte Stripe.",
  config: "Ajoutez d'abord STRIPE_SECRET_KEY dans le fichier .env, puis redémarrez le serveur.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const { stripe } = await searchParams;
  const { store } = await requireOwner();
  const configured = stripeConfigured();

  return (
    <>
      <PageHeader title="Paramètres" actions={<Link href="/admin/settings/users" className="btn">Utilisateurs et autorisations</Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsForm name={store.name} tagline={store.tagline} currency={store.currency} shipping={centsToInput(store.shippingCents)} freeFrom={centsToInput(store.freeShippingFromCents)} />

        <section id="paiements" className="card flex flex-col gap-4 self-start p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-[650]">Paiements</h2>
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
            <a href="/api/stripe/connect" className={store.stripeChargesEnabled ? "btn" : "btn btn-primary"}>
              {store.stripeChargesEnabled ? "Ouvrir mon tableau de bord Stripe" : store.stripeAccountId ? "Terminer l'inscription Stripe" : "Connecter Stripe"}
            </a>
          ) : (
            <p className="rounded-lg bg-[#ebebeb] px-3 py-2 text-xs text-muted">La plateforme n'a pas encore de clé Stripe. Voir le README, section « Activer Stripe ».</p>
          )}
          {configured && isTestMode() && <p className="text-xs text-muted">Mode test Stripe : aucun argent réel ne circule. Carte de test : 4242 4242 4242 4242.</p>}
        </section>
      </div>
    </>
  );
}
