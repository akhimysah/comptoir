import Link from "next/link";
import { notFound } from "next/navigation";
import { publish } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { CustomCssForm } from "@/components/admin/CustomCssForm";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { GithubIcon } from "@/components/admin/ThemeImportMenu";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { getCatalog } from "@/lib/storefront";
import { readTheme } from "@/lib/theme";
import { ownTheme } from "@/lib/themes";
import { formatDateTime } from "@/lib/utils";

/** Éditeur d'un thème de la bibliothèque (publié ou brouillon). */
export default async function ThemeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, id);
  if (!theme) notFound();
  const published = store.publishedThemeId === theme.id;
  const { products, collections } = await getCatalog(store.id);
  return (
    <>
      <PageHeader
        back="/admin/theme"
        title={theme.name}
        subtitle={`${published ? "Thème publié : chaque enregistrement met la boutique à jour." : "Brouillon : la boutique ne change pas tant qu'il n'est pas publié."} Dernier enregistrement : ${formatDateTime(theme.updatedAt)}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {published ? <Pill tone="ok">Publié</Pill> : <Pill>Brouillon</Pill>}
            {theme.githubRepo && <a href={`https://github.com/${theme.githubRepo}/tree/${theme.githubBranch}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#ebebeb] px-2 py-1 text-xs font-[550] hover:bg-[#e3e3e3]"><GithubIcon className="h-3.5 w-3.5" />{theme.githubRepo.split("/")[1]}/{theme.githubBranch}</a>}
            <a href={`/s/${store.slug}/preview?theme=${theme.id}`} target="_blank" className="btn">Aperçu</a>
            {!published && <form action={publish}><input type="hidden" name="id" value={theme.id} /><ConfirmSubmit label="Publier" confirmLabel={`Publier « ${theme.name} »`} className="btn-primary" /></form>}
            {published && <Link href={`/s/${store.slug}`} target="_blank" className="btn">Voir la boutique</Link>}
          </div>
        }
      />
      {theme.githubError && <p role="alert" className="rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[13px] text-[#8e0b21]">{theme.githubError}</p>}
      <ThemeEditor themeId={theme.id} published={published} initial={readTheme(theme.theme, store.name)} store={{ slug: store.slug, name: store.name, currency: store.currency }} products={products} collections={collections} />
      <CustomCssForm css={theme.customCss} slug={store.slug} themeId={theme.id} />
    </>
  );
}
