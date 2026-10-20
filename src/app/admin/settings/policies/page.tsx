import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { PoliciesForm } from "@/components/admin/PoliciesForm";
import { requireOwner } from "@/lib/auth";
import { storeBase } from "@/lib/domains";
import { POLICY_KEYS, policyTemplate, readPolicies } from "@/lib/checkout-settings";

export default async function PoliciesPage() {
  const { store } = await requireOwner();
  const policies = readPolicies(store.policies);
  const templates = Object.fromEntries(POLICY_KEYS.map((k) => [k, policyTemplate(k, store)])) as Record<(typeof POLICY_KEYS)[number], string>;
  return (
    <>
      <PageHeader back="/admin/settings" title="Politiques" subtitle="Textes légaux de la boutique. Une politique publiée est accessible depuis le pied de page de la boutique." />
      <div className="flex max-w-3xl flex-col gap-4">
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-sm font-[650]">Règles par défaut</h2>
          <p className="text-[13px]">
            {store.returnsEnabled ? <>Retours sous <b>{store.returnWindowDays} jours</b> après l'expédition, demandés par le client depuis « Mon compte ».</> : <>Retours en ligne désactivés (délai enregistré : {store.returnWindowDays} jours).</>}
            {" "}<Link href="/admin/settings#retours" className="underline">Modifier</Link>
          </p>
          <p className="text-xs text-muted">Les mentions de l'entreprise (raison sociale, adresse, SIRET, TVA) viennent de <Link href="/admin/settings" className="underline">Paramètres › Taxes et mentions légales</Link> et pré-remplissent les modèles.</p>
        </section>
        <PoliciesForm policies={policies} templates={templates} base={storeBase(store)} />
      </div>
    </>
  );
}
