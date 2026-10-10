import { removeDomain, saveDomain, verifyDomain } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { CopyField } from "@/components/admin/CopyField";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { cnameTarget, isLocalTestDomain, storeBase, txtRecordName } from "@/lib/domains";
import { appUrl } from "@/lib/stripe";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Nom de domaine" };

export default async function DomainPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const { store } = await requireOwner();
  const verified = Boolean(store.domain && store.domainVerifiedAt);
  const apex = store.domain ? store.domain.split(".").length === 2 : false;

  return (
    <>
      <PageHeader back="/admin/settings" title="Nom de domaine" subtitle="Servez votre boutique à votre propre adresse (www.maboutique.fr) au lieu de l'adresse de la plateforme." />
      {err && <p role="alert" className="mb-4 rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}
      {ok && <p role="status" className="mb-4 rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">{ok}</p>}
      <div className="flex max-w-3xl flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-[650]">Adresse actuelle de la boutique</h2>
          <CopyField value={storeBase(store)} label="Adresse de la boutique" />
          {verified && <p className="text-xs text-muted">L'adresse de la plateforme ({appUrl()}/s/{store.slug}) fonctionne toujours.</p>}
        </section>

        {store.domain ? (
          <section className="card flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 font-mono text-[15px] font-[650]">{store.domain}</h2>
              {verified ? <Pill tone="ok">Connecté depuis le {formatDate(store.domainVerifiedAt!)}</Pill> : <Pill tone="warn">En attente de vérification</Pill>}
              <form action={removeDomain}><ConfirmSubmit label="Retirer" confirmLabel="Retirer le domaine" className="h-8" /></form>
            </div>
            {!verified && (
              <>
                <p className="text-[13px]">Chez votre registraire (OVH, Gandi, IONOS, GoDaddy…), ajoutez ces deux enregistrements DNS, puis cliquez sur « Vérifier ».</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[13px]">
                    <thead><tr><th className="th">Type</th><th className="th">Nom</th><th className="th">Valeur</th></tr></thead>
                    <tbody>
                      <tr><td className="td font-mono">TXT</td><td className="td font-mono">{txtRecordName(store.domain)}</td><td className="td"><CopyField value={store.domainToken ?? ""} label="Valeur TXT" /></td></tr>
                      {apex
                        ? <tr><td className="td font-mono">A</td><td className="td font-mono">{store.domain}</td><td className="td text-muted">Adresse IP indiquée par votre hébergeur (Vercel : 76.76.21.21)</td></tr>
                        : <tr><td className="td font-mono">CNAME</td><td className="td font-mono">{store.domain}</td><td className="td"><CopyField value={cnameTarget()} label="Valeur CNAME" /></td></tr>}
                    </tbody>
                  </table>
                </div>
                {apex && <p className="text-xs text-muted">Conseil : utilisez plutôt « www.{store.domain} » (un CNAME est plus simple et plus fiable qu'une adresse IP).</p>}
                {isLocalTestDomain(store.domain) && <p className="text-xs text-muted">Domaine de test local (*.localhost) : vérifié sans DNS, en développement seulement.</p>}
                <form action={verifyDomain}><button className="btn btn-primary">Vérifier</button></form>
              </>
            )}
            <p className="text-xs text-muted">Le certificat HTTPS est fourni par l'hébergeur une fois le domaine ajouté au projet{process.env.VERCEL_TOKEN ? " (fait automatiquement à la vérification)" : " (sur Vercel : Settings → Domains, ou automatique avec VERCEL_TOKEN et VERCEL_PROJECT_ID)"}.</p>
          </section>
        ) : (
          <form action={saveDomain} className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-[650]">Connecter un domaine</h2>
            <p className="text-[13px] text-muted">Vous devez déjà posséder ce nom de domaine (acheté chez un registraire).</p>
            <div className="flex flex-wrap gap-2">
              <input name="domain" required maxLength={253} placeholder="www.maboutique.fr" aria-label="Nom de domaine" className="input max-w-sm flex-1" />
              <button className="btn btn-primary">Continuer</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
