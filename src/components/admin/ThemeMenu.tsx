import type { StoreTheme } from "@prisma/client";
import { duplicate, remove, rename } from "@/app/admin/theme/actions";
import { disconnectGithub, pushToGithub, updateFromGithub } from "@/app/admin/theme/github-actions";
import { THEME_FORMAT_VERSION } from "@/lib/theme-files";
import { ConfirmSubmit } from "./ConfirmSubmit";

const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[#f1f1f1]";
const Divider = () => <div className="my-1.5 border-t border-line" />;
const Eye = () => <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#4a4a4a]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2.5" /></svg>;
const Pencil = () => <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#4a4a4a]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m13.5 3.5 3 3L7 16H4v-3l9.5-9.5Z" /></svg>;
const Info = () => <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#4a4a4a]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.5v.5" /></svg>;

/** Menu « ⋯ » d'un thème, comme sur Shopify : afficher, renommer, dupliquer, modifier le code, contenu par défaut, télécharger. */
export function ThemeMenu({ theme, slug, published, owner, dropUp = false }: { theme: StoreTheme; slug: string; published: boolean; owner: boolean; dropUp?: boolean }) {
  const hidden = <input type="hidden" name="id" value={theme.id} />;
  return (
    <details className="relative">
      <summary className="btn h-8 w-8 cursor-pointer list-none px-0 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-1" aria-label={`Actions pour ${theme.name}`}>⋯</summary>
      <div className={`absolute right-0 z-30 w-64 rounded-xl ${dropUp ? "bottom-full mb-1" : "mt-1"} border border-line bg-white p-1.5 text-ink shadow-[0_12px_32px_-12px_rgba(0,0,0,.3)]`}>
        <a href={`/s/${slug}/preview?theme=${theme.id}`} target="_blank" className={item}><Eye />Afficher</a>
        <details className="group">
          <summary className={`${item} cursor-pointer list-none`}><Pencil />Renommer</summary>
          <form action={rename} className="flex gap-1 p-2">{hidden}<input name="name" defaultValue={theme.name} maxLength={60} required className="input h-8 flex-1" aria-label="Nouveau nom" /><button className="btn btn-sm h-8">OK</button></form>
        </details>
        <Divider />
        <form action={duplicate}>{hidden}<button className={item}>Dupliquer</button></form>
        <a href={`/admin/theme/${theme.id}/code`} className={item}>Modifier le code</a>
        <a href="/admin/settings/languages?tab=store" className={item}>Modifier le contenu de thème par défaut</a>
        <a href={`/admin/theme/${theme.id}/zip`} className={item}>Télécharger le fichier du thème</a>
        {theme.githubRepo && owner && (
          <>
            <Divider />
            <form action={updateFromGithub}>{hidden}<button className={item}>Mettre à jour depuis GitHub</button></form>
            <form action={pushToGithub}>{hidden}<button className={item}>Envoyer vers GitHub</button></form>
            <form action={disconnectGithub}>{hidden}<button className={item}>Déconnecter de GitHub</button></form>
          </>
        )}
        {!published && (
          <>
            <Divider />
            <form action={remove}>{hidden}<ConfirmSubmit label="Supprimer" confirmLabel="Supprimer ce thème" className={`${item} text-[#8e0b21]`} /></form>
          </>
        )}
        <Divider />
        <div className={`${item} cursor-default text-muted hover:bg-transparent`}><Info />Version {THEME_FORMAT_VERSION}</div>
      </div>
    </details>
  );
}
