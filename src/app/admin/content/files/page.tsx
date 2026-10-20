import { Empty, PageHeader } from "@/components/ui";
import { FilesManager } from "@/components/admin/FilesManager";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaFileReferences } from "@/lib/media-files";

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { store } = await requirePerm("content");
  const query = q.trim();
  const files = await db.mediaFile.findMany({ where: { storeId: store.id, ...(query ? { name: { contains: query } } : {}) }, orderBy: { createdAt: "desc" }, take: 500 });
  const refs = await mediaFileReferences(store.id, files.map((f) => f.url));
  const total = query ? await db.mediaFile.count({ where: { storeId: store.id } }) : files.length;
  const rows = files.map((f) => ({ id: f.id, url: f.url, name: f.name, alt: f.alt, mime: f.mime, size: f.size, createdAt: f.createdAt.toISOString(), products: refs.get(f.url)?.products ?? 0, theme: refs.get(f.url)?.theme ?? false }));
  return (
    <>
      <PageHeader title="Fichiers" subtitle={`${total} fichier${total > 1 ? "s" : ""} · images envoyées pour vos produits, pages, articles et votre thème.`} />
      {!total ? (
        <>
          <FilesManager files={[]} query={query} />
          <Empty title="Aucun fichier">Les images que vous envoyez depuis un produit, une page ou le thème apparaîtront ici. Vous pouvez aussi en envoyer directement.</Empty>
        </>
      ) : (
        <FilesManager files={rows} query={query} />
      )}
    </>
  );
}
