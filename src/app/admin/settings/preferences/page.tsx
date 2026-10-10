import { savePreferences } from "./actions";
import { CopyField } from "@/components/admin/CopyField";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { store } = await requireOwner();
  return (
    <>
      <PageHeader back="/admin/settings" title="Préférences" subtitle="Accès à la boutique en ligne et mesure d'audience." />
      {ok && <p role="status" className="card mb-4 bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Préférences enregistrées.</p>}
      {err && <p role="alert" className="card mb-4 bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{err}</p>}
      <form action={savePreferences} className="flex max-w-3xl flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-[650]">Protection par mot de passe</h2>
            {store.passwordEnabled ? <Pill tone="attention">Boutique fermée au public</Pill> : <Pill tone="ok">Boutique ouverte</Pill>}
          </div>
          <p className="text-xs text-muted">Pendant que vous préparez votre boutique, seuls les visiteurs qui ont le mot de passe peuvent la voir. Vous et votre équipe la voyez toujours en étant connectés. Les moteurs de recherche ne l'indexent pas.</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="passwordEnabled" defaultChecked={store.passwordEnabled} className="h-4 w-4 accent-[#7c3aed]" />Protéger la boutique par un mot de passe</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Mot de passe <span className="hint">À donner à vos testeurs.</span><input name="storePassword" defaultValue={store.storePassword} maxLength={60} autoComplete="off" className="input" /></label>
            <label className="label">Message aux visiteurs<input name="passwordMessage" defaultValue={store.passwordMessage} maxLength={300} className="input" /></label>
          </div>
        </section>
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-[650]">Mesure d'audience</h2>
          <p className="text-xs text-muted">Visites et achats envoyés à vos outils. Conformément au RGPD, un bandeau demande l'accord du visiteur : rien n'est chargé s'il refuse.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Google Analytics 4 <span className="hint">ID de mesure, ex. G-AB12CD34EF</span><input name="gaId" defaultValue={store.gaId} maxLength={30} placeholder="G-…" className="input font-mono" /></label>
            <label className="label">Pixel Meta (Facebook, Instagram) <span className="hint">ID du pixel, uniquement des chiffres</span><input name="metaPixelId" defaultValue={store.metaPixelId} maxLength={30} inputMode="numeric" className="input font-mono" /></label>
          </div>
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Adresse de la boutique</h2>
          <CopyField value={`${appUrl()}/s/${store.slug}`} label="Adresse de la boutique" />
        </section>
        <button className="btn btn-primary self-end">Enregistrer</button>
      </form>
    </>
  );
}
