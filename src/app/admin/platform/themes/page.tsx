import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/errors";
import { PlatformThemesClient } from "./PlatformThemesClient";

export const metadata = { title: "Bibliothèque de thèmes" };

/** Administration de la plateforme : les thèmes Shopify proposés à toutes les boutiques (comme le Theme Store). */
export default async function PlatformThemesPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  const { ok } = await searchParams;
  const themes = await db.platformTheme.findMany({ where: { ready: true }, orderBy: { position: "asc" }, include: { _count: { select: { files: true } } } });
  const sizes = await db.platformThemeFile.groupBy({ by: ["themeId"], _sum: { size: true } });
  return (
    <>
      <PageHeader back="/admin" title="Bibliothèque de thèmes de la plateforme" subtitle="Les thèmes Shopify déposés ici sont proposés dans « Découvrir des thèmes » de chaque boutique ; « Ajouter » en installe une copie complète dans la boutique. Vous devez détenir une licence pour chaque thème que vous mettez à disposition." />
      {ok && <p role="status" className="rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">{ok}</p>}
      <PlatformThemesClient themes={themes.map((t) => ({ id: t.id, name: t.name, version: t.version, author: t.author, description: t.description, thumbnail: t.thumbnail, files: t._count.files, size: sizes.find((s) => s.themeId === t.id)?._sum.size ?? 0 }))} />
    </>
  );
}
