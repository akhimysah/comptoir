import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProduct } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";
import { db } from "@/lib/db";
import { centsToInput } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { store } = await requireStore();
  const product = await db.product.findFirst({ where: { id, storeId: store.id }, include: { variants: { orderBy: { position: "asc" } }, collections: true } });
  if (!product) notFound();
  const collections = await db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } });

  return (
    <>
      <PageHeader
        back="/admin/products"
        title={product.title}
        subtitle={saved ? <span className="font-[550] text-[#0c5132]">Produit enregistré</span> : undefined}
        actions={
          <>
            {product.status === "active" && <Link href={`/s/${store.slug}/p/${product.handle}`} target="_blank" className="btn">Aperçu</Link>}
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ConfirmSubmit label="Supprimer" confirmLabel="Confirmer la suppression" />
            </form>
          </>
        }
      />
      <ProductForm
        key={product.updatedAt.toISOString()}
        currency={store.currency}
        collections={collections}
        storeUrl={`${appUrl()}/s/${store.slug}`}
        handle={product.handle}
        initial={{
          id: product.id,
          seoTitle: product.seoTitle,
          isGiftCard: product.isGiftCard,
          seoDescription: product.seoDescription,
          title: product.title,
          description: product.description,
          status: product.status as "draft" | "active",
          hue: product.hue,
          images: parseJson(product.images, []),
          options: parseJson(product.options, []),
          variants: product.variants.map((v) => ({ id: v.id, optionValues: parseJson(v.optionValues, []), price: centsToInput(v.priceCents), compareAt: centsToInput(v.compareAtCents), sku: v.sku, stock: v.stock })),
          collectionIds: product.collections.map((c) => c.collectionId),
        }}
      />
    </>
  );
}
