import { notFound } from "next/navigation";
import { deleteContent } from "@/app/admin/content-actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ContentForm } from "@/components/admin/ContentForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";
import { storeBase } from "@/lib/domains";

export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { store, user } = await requirePerm("content");
  const item = id === "new" ? null : await db.page.findFirst({ where: { id, storeId: store.id } });
  if (id !== "new" && !item) notFound();
  const extra = item as (typeof item & { excerpt?: string; author?: string; image?: string | null; showInFooter?: boolean }) | null;
  return (
    <>
      <PageHeader
        back="/admin/pages"
        title={item?.title ?? "Ajouter une page"}
        subtitle={saved ? <span className="font-[550] text-[#0c5132]">Enregistré</span> : undefined}
        actions={item && (
          <>
            {item.published && <a href={`/s/${store.slug}/pages/${item.handle}`} target="_blank" className="btn">Voir</a>}
            <form action={deleteContent}><input type="hidden" name="kind" value="page" /><input type="hidden" name="id" value={item.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" /></form>
          </>
        )}
      />
      <ContentForm
        key={item?.updatedAt.toISOString() ?? "new"}
        storeUrl={`${storeBase(store)}`}
        initial={{
          kind: "page",
          id: item?.id,
          title: item?.title ?? "",
          handle: item?.handle ?? "",
          body: item?.body ?? "",
          excerpt: extra?.excerpt ?? "",
          author: extra?.author ?? user.name,
          image: extra?.image ?? null,
          published: item?.published ?? true,
          showInFooter: extra?.showInFooter ?? true,
          seoTitle: item?.seoTitle ?? "",
          seoDescription: item?.seoDescription ?? "",
        }}
      />
    </>
  );
}
