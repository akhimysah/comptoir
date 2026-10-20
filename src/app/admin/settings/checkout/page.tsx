import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { addBusinessDays, fieldMode, type FieldMode } from "@/lib/checkout-settings";
import { saveCheckoutSettings } from "./actions";

const MODES: { value: FieldMode; label: string }[] = [
  { value: "hidden", label: "Masqué" },
  { value: "optional", label: "Facultatif" },
  { value: "required", label: "Obligatoire" },
];

function ModeField({ name, label, hint, value }: { name: string; label: string; hint: string; value: FieldMode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[13px] font-[550]">{label}</legend>
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap gap-4">
        {MODES.map((m) => <label key={m.value} className="flex items-center gap-1.5 text-[13px]"><input type="radio" name={name} value={m.value} defaultChecked={value === m.value} className="accent-[#7c3aed]" />{m.label}</label>)}
      </div>
    </fieldset>
  );
}

export default async function CheckoutSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { store } = await requireOwner();
  const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const hasEstimates = store.deliveryMinDays != null && store.deliveryMaxDays != null;
  const example = hasEstimates ? { from: addBusinessDays(new Date(), store.fulfillmentDays + store.deliveryMinDays!), to: addBusinessDays(new Date(), store.fulfillmentDays + store.deliveryMaxDays!) } : null;

  return (
    <>
      <PageHeader back="/admin/settings" title="Page de paiement" subtitle="Ce que vos clients renseignent pour commander, et ce qu'ils voient dans le panier." />
      {ok && <p role="status" className="card mb-4 bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Page de paiement enregistrée.</p>}
      {err && <p role="alert" className="card mb-4 bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{err}</p>}
      <form action={saveCheckoutSettings} className="flex max-w-3xl flex-col gap-4">
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-sm font-[650]">Informations client</h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-[550]">Nom complet</span>
            <p className="text-xs text-muted">Toujours demandé : il figure sur la commande, l'étiquette et la facture.</p>
          </div>
          <ModeField name="checkoutCompany" label="Nom de l'entreprise" hint="Utile si vous livrez des professionnels : il s'ajoute à l'adresse de livraison." value={fieldMode(store.checkoutCompany, "hidden")} />
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="checkoutAddress2" defaultChecked={store.checkoutAddress2} className="h-4 w-4 accent-[#7c3aed]" />Proposer une ligne d'adresse 2 (appartement, bâtiment, étage…)</label>
          <ModeField name="checkoutPhone" label="Numéro de téléphone" hint="Pratique pour le transporteur en cas de problème de livraison." value={fieldMode(store.checkoutPhone, "optional")} />
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-[650]">E-mail marketing</h2>
          <p className="text-xs text-muted">Le client peut cocher « Recevoir les nouveautés et offres par e-mail » en commandant.</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="marketingPreselect" defaultChecked={store.marketingPreselect} className="h-4 w-4 accent-[#7c3aed]" />Présélectionner la case</label>
          <p className="text-xs text-muted">Attention : dans l'Union européenne, une case précochée ne vaut pas consentement. Laissez-la décochée si vos clients y sont.</p>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-[650]">Limite d'ajout au panier</h2>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="cartLimit" defaultChecked={store.cartLimit} className="h-4 w-4 accent-[#7c3aed]" />Limiter la quantité au stock disponible</label>
          <p className="text-xs text-muted">Le panier n'accepte jamais plus que le stock réel : la quantité est vérifiée à chaque calcul du panier et à la commande. Les produits réglés sur « Continuer à vendre en rupture » restent commandables sans limite. Ce réglage est conservé pour information.</p>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-[650]">Dates de livraison estimées</h2>
          <p className="text-xs text-muted">Affichées dans le panier : « Livraison estimée entre le … et le … ». Calculées en jours ouvrés à partir de la commande, délai de traitement compris ({store.fulfillmentDays} jour{store.fulfillmentDays > 1 ? "s" : ""}, réglé dans <Link href="/admin/settings#commandes" className="underline">Paramètres › Commandes</Link>).</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="estimates" defaultChecked={hasEstimates} className="h-4 w-4 accent-[#7c3aed]" />Afficher une estimation de livraison</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Transport, au plus tôt (jours ouvrés)<input name="deliveryMinDays" type="number" min={0} max={90} defaultValue={store.deliveryMinDays ?? 2} className="input num w-28" /></label>
            <label className="label">Transport, au plus tard (jours ouvrés)<input name="deliveryMaxDays" type="number" min={0} max={90} defaultValue={store.deliveryMaxDays ?? 4} className="input num w-28" /></label>
          </div>
          {example && <p className="text-[13px]">Aujourd'hui, vos clients verraient : <b>Livraison estimée entre le {fmt(example.from)} et le {fmt(example.to)}.</b></p>}
        </section>

        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-sm font-[650]">Textes du processus de paiement</h2>
          <p className="text-xs text-muted">Les libellés du panier et de la commande existent en français et en anglais. Pour les adapter ou traduire d'autres textes de la boutique, passez par les langues.</p>
          <Link href="/admin/settings/languages" className="btn self-start">Modifier le contenu du processus de paiement</Link>
        </section>
        <button className="btn btn-primary self-end">Enregistrer</button>
      </form>
    </>
  );
}
