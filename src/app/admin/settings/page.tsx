import { SettingsForm } from "@/components/admin/SettingsForm";
import { TaxForm } from "@/components/admin/TaxForm";
import { LoyaltyForm } from "@/components/admin/LoyaltyForm";
import { CurrenciesForm } from "@/components/admin/CurrenciesForm";
import { ReturnsForm } from "@/components/admin/ReturnsForm";
import { OrderSettingsForm } from "@/components/admin/OrderSettingsForm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTime, parseJson } from "@/lib/utils";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import Link from "next/link";
import { centsToInput } from "@/lib/money";
import { readManualPayments } from "@/lib/checkout-settings";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const { stripe } = await searchParams;
  // Retour de Stripe Connect : la page Paiements affiche le résultat.
  if (stripe) redirect(`/admin/settings/payments?stripe=${encodeURIComponent(stripe)}#paiements`);
  const { store } = await requireOwner();
  const last = await db.order.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
  const manual = readManualPayments(store.manualPayments).filter((m) => m.enabled && m.name);

  return (
    <>
      <PageHeader title="Paramètres" actions={<><Link href="/admin/settings/payments" className="btn">Paiements</Link><Link href="/admin/settings/checkout" className="btn">Page de paiement</Link><Link href="/admin/settings/shipping" className="btn">Expédition et livraison</Link><Link href="/admin/settings/policies" className="btn">Politiques</Link><Link href="/admin/settings/preferences" className="btn">Préférences</Link><Link href="/admin/settings/custom-data" className="btn">Données personnalisées</Link><Link href="/admin/settings/notifications" className="btn">Notifications</Link><Link href="/admin/settings/users" className="btn">Utilisateurs et autorisations</Link><Link href="/admin/settings/activity" className="btn">Journal d'activité</Link><Link href="/admin/settings/locations" className="btn">Emplacements</Link><Link href="/admin/settings/plan" className="btn">Forfait</Link><Link href="/admin/settings/languages" className="btn">Langues</Link><Link href="/admin/settings/markets" className="btn">Marchés</Link><Link href="/admin/settings/domain" className="btn">Nom de domaine</Link><Link href="/admin/settings/api" className="btn">API et webhooks</Link></>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <SettingsForm name={store.name} tagline={store.tagline} currency={store.currency} shipping={centsToInput(store.shippingCents)} freeFrom={centsToInput(store.freeShippingFromCents)} lowStockThreshold={store.lowStockThreshold} />
          <OrderSettingsForm prefix={store.orderPrefix} suffix={store.orderSuffix} autoArchive={store.autoArchive} fulfillmentDays={store.fulfillmentDays} nextNumber={(last?.number ?? 1000) + 1} />
          <LoyaltyForm enabled={store.loyaltyEnabled} perUnit={store.loyaltyPointsPerUnit} rewardPoints={store.loyaltyRewardPoints} rewardValue={centsToInput(store.loyaltyRewardCents)} currency={store.currency} />
          <ReturnsForm enabled={store.returnsEnabled} days={store.returnWindowDays} instructions={store.returnInstructions} />
          <CurrenciesForm base={store.currency} current={parseJson(store.displayCurrencies, [])} charge={store.chargeInCustomerCurrency} autoRates={store.autoRates} updatedAt={store.ratesUpdatedAt ? formatDateTime(store.ratesUpdatedAt) : null} />
          <TaxForm taxRateBps={store.taxRateBps} vatByCountry={store.vatByCountry} legalName={store.legalName} legalAddress={store.legalAddress} siret={store.siret} vatNumber={store.vatNumber} />
        </div>

        <section id="paiements" className="card flex flex-col gap-4 self-start p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-[650]">Paiements</h2>
            {store.stripeChargesEnabled ? <Pill tone="ok">Carte bancaire activée</Pill> : store.stripeAccountId ? <Pill tone="warn">Inscription à terminer</Pill> : <Pill>Démonstration</Pill>}
          </div>
          <p className="text-sm text-muted">
            {store.stripeChargesEnabled ? "Vos clients paient par carte, Apple Pay ou Google Pay via Stripe." : "Connectez Stripe pour encaisser par carte."}
            {manual.length ? ` Moyens de paiement manuels proposés : ${manual.map((m) => m.name).join(", ")}.` : " Aucun moyen de paiement manuel (virement, à la livraison) n'est proposé."}
          </p>
          <Link href="/admin/settings/payments" className={store.stripeChargesEnabled ? "btn self-start" : "btn btn-primary self-start"}>Gérer les paiements</Link>
        </section>
      </div>
    </>
  );
}
