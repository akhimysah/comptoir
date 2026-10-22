import { notFound } from "next/navigation";
import { deleteCollection } from "../actions";
import { CollectionForm } from "@/components/admin/CollectionForm";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { storeBase } from "@/lib/domains";

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("products");
  const isNew = id === "new";
  const collection = isNew ? null : await db.collection.findFirst({ where: { id, storeId: store.id }, include: { products: true } });
  if (!isNew && !collection) notFound();
  const fieldDefs = await db.metafieldDefinition.findMany({ where: { storeId: store.id, owner: "collection" }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const products = (await db.product.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" } })).map((p) => ({ id: p.id, title: p.title, hue: p.hue, status: p.status, image: parseJson<string[]>(p.images, [])[0] ?? null }));

  return (
    <>
      <PageHeader
        title={collection?.title ?? "Nouvelle collection"}
        subtitle={saved ? <span className="font-semibold text-pine">Collection enregistrée.</span> : undefined}
        actions={collection && (
          <form action={deleteCollection}><input type="hidden" name="id" value={collection.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer la suppression" /></form>
        )}
      />
      <CollectionForm
        key={collection?.id ?? "new"}
        products={products}
        fieldDefs={fieldDefs}
        storeUrl={`${storeBase(store)}`}
        initial={{ id: collection?.id, title: collection?.title ?? "", description: collection?.description ?? "", image: collection?.image ?? null, productIds: collection?.products.map((p) => p.productId) ?? [], seoTitle: collection?.seoTitle ?? "", seoDescription: collection?.seoDescription ?? "", metafields: parseJson<Record<string, string>>(collection?.metafields, {}) }}
      />
    </>
  );
}
