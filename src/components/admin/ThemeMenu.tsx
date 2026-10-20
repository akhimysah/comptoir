import type { StoreTheme } from "@prisma/client";
import { duplicate, remove, rename } from "@/app/admin/theme/actions";
import { disconnectGithub, pushToGithub, updateFromGithub } from "@/app/admin/theme/github-actions";
import { ConfirmSubmit } from "./ConfirmSubmit";

const item = "flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[#f1f1f1]";

/** Menu « ⋯ » d'un thème de la bibliothèque : renommer, dupliquer, aperçu, télécharger, GitHub, supprimer. */
export function ThemeMenu({ theme, slug, published, owner }: { theme: StoreTheme; slug: string; published: boolean; owner: boolean }) {
  const hidden = <input type="hidden" name="id" value={theme.id} />;
  return (
    <details className="relative">
      <summary className="btn h-8 w-8 cursor-pointer list-none px-0 text-center" aria-label={`Actions pour ${theme.name}`}>⋯</summary>
      <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,.3)]">
        <a href={`/s/${slug}/preview?theme=${theme.id}`} target="_blank" className={item}>Aperçu{published ? " de la boutique" : " du brouillon"}</a>
        <details className="group">
          <summary className={`${item} cursor-pointer list-none`}>Renommer</summary>
          <form action={rename} className="flex gap-1 p-2">{hidden}<input name="name" defaultValue={theme.name} maxLength={60} required className="input h-8 flex-1" aria-label="Nouveau nom" /><button className="btn btn-sm h-8">OK</button></form>
        </details>
        <form action={duplicate}>{hidden}<button className={item}>Dupliquer</button></form>
        <a href={`/admin/theme/${theme.id}/zip`} className={item}>Télécharger (.zip)</a>
        {theme.githubRepo && owner && (
          <>
            <div className="my-1 border-t border-line" />
            <form action={updateFromGithub}>{hidden}<button className={item}>Mettre à jour depuis GitHub</button></form>
            <form action={pushToGithub}>{hidden}<button className={item}>Envoyer vers GitHub</button></form>
            <form action={disconnectGithub}>{hidden}<button className={item}>Déconnecter de GitHub</button></form>
          </>
        )}
        {!published && (
          <>
            <div className="my-1 border-t border-line" />
            <form action={remove}>{hidden}<ConfirmSubmit label="Supprimer" confirmLabel="Supprimer ce thème" className={`${item} text-[#8e0b21]`} /></form>
          </>
        )}
      </div>
    </details>
  );
}
