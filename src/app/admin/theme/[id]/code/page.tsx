import { notFound } from "next/navigation";
import { ThemeCodeEditor } from "@/components/admin/ThemeCodeEditor";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTextPath } from "@/lib/liquid/source";
import { themeFiles } from "@/lib/theme-files";
import { ownTheme } from "@/lib/themes";

export const metadata = { title: "Modifier le code" };

/** « Modifier le code » : les fichiers du thème (les mêmes que dans le .zip et sur GitHub). */
export default async function ThemeCodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, id);
  if (!theme) notFound();
  const published = store.publishedThemeId === theme.id;
  return (
    <>
      <PageHeader back="/admin/theme" title={`${theme.name} · code`} subtitle={published ? "Thème publié : chaque enregistrement met la boutique à jour. ⌘S pour enregistrer." : "Brouillon : la boutique ne change pas tant qu'il n'est pas publié. ⌘S pour enregistrer."} actions={<div className="flex items-center gap-2">{published ? <Pill tone="ok">Publié</Pill> : <Pill>Brouillon</Pill>}<a href={`/admin/theme/${theme.id}`} className="btn">Éditeur visuel</a><a href={`/s/${store.slug}/preview?theme=${theme.id}`} target="_blank" className="btn">Afficher</a></div>} />
      {theme.engine === "liquid" ? <ThemeCodeEditor themeId={theme.id} initial={{}} paths={(await db.themeFile.findMany({ where: { themeId: theme.id }, select: { path: true }, orderBy: { path: "asc" } })).map((f) => f.path).filter(isTextPath)} /> : <ThemeCodeEditor themeId={theme.id} initial={themeFiles({ ...theme, name: store.name })} />}
    </>
  );
}
