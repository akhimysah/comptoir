import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PageHeader, Pill } from "@/components/ui";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/errors";
import { appConfig, appManifest, forgetAppConfig, GH_WEB } from "@/lib/github-app";
import { signState } from "@/lib/secret-box";
import { appUrl } from "@/lib/stripe";

export const metadata = { title: "Application GitHub" };

async function forget() {
  "use server";
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  await forgetAppConfig();
  revalidatePath("/admin/platform/github");
}

/** Application GitHub de la plateforme : créée en un clic grâce au manifeste GitHub. */
export default async function PlatformGithubPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; org?: string; name?: string }> }) {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  const { ok, err, org = "", name = "" } = await searchParams;
  const app = await appConfig();
  const fromEnv = Boolean(process.env.GITHUB_APP_ID);
  const linked = app ? await db.store.count({ where: { githubInstallationId: { not: null } } }) : 0;
  const local = !appUrl().startsWith("https://") || appUrl().includes("localhost");
  const state = signState(["manifest", user.id]);
  const appName = name || "Revolution Ecom";
  const target = `${GH_WEB()}/${org ? `organizations/${encodeURIComponent(org)}/` : ""}settings/apps/new?state=${encodeURIComponent(state)}`;

  return (
    <>
      <PageHeader back="/admin" title="Application GitHub" subtitle="Permet aux marchands de relier le thème de leur boutique à GitHub en un clic (« Se connecter à GitHub »), comme sur Shopify." />
      {ok && <p role="status" className="mb-4 rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">Application GitHub créée et enregistrée. Le bouton « Se connecter à GitHub » est maintenant disponible pour les marchands.</p>}
      {err && <p role="alert" className="mb-4 rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}
      {app ? (
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="flex-1 font-[650]">{app.slug}</h2><Pill tone="ok">Active</Pill></div>
          <p className="text-[13px]">Application n° {app.appId}{app.owner ? `, appartenant à ${app.owner}` : ""}. {linked} boutique(s) connectée(s).{fromEnv ? " Identifiants lus dans les variables d'environnement GITHUB_APP_*." : " Identifiants enregistrés chiffrés dans la base."}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`${GH_WEB()}/apps/${app.slug}`} target="_blank" rel="noopener noreferrer" className="btn">Page publique de l'application</a>
            <a href={`${GH_WEB()}/settings/apps/${app.slug}`} target="_blank" rel="noopener noreferrer" className="btn">Réglages sur GitHub</a>
            {!fromEnv && <form action={forget} className="ml-auto"><ConfirmSubmit label="Oublier les identifiants" confirmLabel="Oublier (les boutiques connectées seront déconnectées de fait)" /></form>}
          </div>
        </section>
      ) : (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-[650]">Créer l'application GitHub de la plateforme</h2>
          <p className="text-[13px]">GitHub vous demande de confirmer la création, puis vous ramène ici : les identifiants (numéro, clé privée, secret du webhook) sont enregistrés automatiquement, chiffrés. Rien à copier.</p>
          {local && <p className="rounded-lg bg-[#fff1e3] px-3 py-2 text-[13px] text-[#5e4200]">Vous êtes en local ({appUrl()}) : l'application sera créée avec ces adresses et sans webhook (GitHub ne peut pas joindre votre ordinateur). Pour la mise en ligne, recréez-la depuis le site en ligne.</p>}
          <form method="get" className="grid gap-3 sm:grid-cols-2">
            <label className="label">Nom de l'application <span className="hint">Unique sur tout GitHub</span><input name="name" defaultValue={appName} maxLength={34} className="input" /></label>
            <label className="label">Organisation GitHub <span className="hint">Facultatif : sinon, votre compte personnel</span><input name="org" defaultValue={org} className="input" /></label>
            <button className="btn self-end sm:col-span-2 sm:justify-self-start">Mettre à jour</button>
          </form>
          <form action={target} method="post">
            <input type="hidden" name="manifest" value={JSON.stringify(appManifest(appName))} />
            <button className="btn btn-primary">Créer l'application « {appName} » sur GitHub</button>
          </form>
        </section>
      )}
    </>
  );
}
