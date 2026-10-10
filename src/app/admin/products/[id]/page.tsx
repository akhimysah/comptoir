import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProduct } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bundleChoicesFor } from "@/lib/bundle-choices";
import { centsToInput } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("products");
  const product = await db.product.findFirst({ where: { id, storeId: store.id }, include: { variants: { orderBy: { position: "asc" } }, collections: true } });
  if (!product) notFound();
  const bundleParts = await db.bundleItem.findMany({ where: { bundleId: product.id } });
  const choices = await bundleChoicesFor(store.id, product.id);
  const collections = await db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  const waiting = await db.stockAlert.count({ where: { storeId: store.id, notifiedAt: null, variantId: { in: product.variants.map((v) => v.id) } } });

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
      {waiting > 0 && (
        <p className="card mb-4 flex flex-wrap items-center gap-2 px-4 py-3 text-[13px]">
          <span className="rounded-md bg-[#ffeb78] px-1.5 font-[650] text-[#4f4700]">{waiting}</span>
          client{waiting > 1 ? "s attendent" : " attend"} le retour en stock de ce produit. Ils seront prévenus par e-mail dès que vous remettrez du stock.
        </p>
      )}
      <ProductForm
        key={product.updatedAt.toISOString()}
        currency={store.currency}
        collections={collections}
        storeUrl={`${appUrl()}/s/${store.slug}`}
        bundleChoices={choices}
        handle={product.handle}
        initial={{
          id: product.id,
          seoTitle: product.seoTitle,
          isGiftCard: product.isGiftCard,
          continueSelling: product.continueSelling,
          subscriptionInterval: (product.subscriptionInterval ?? "") as "" | "week" | "month",
          subscriptionDiscountPct: product.subscriptionDiscountBps / 100,
          bundle: bundleParts.map((b) => ({ variantId: b.variantId, quantity: b.quantity })),
          seoDescription: product.seoDescription,
          title: product.title,
          description: product.description,
          status: product.status as "draft" | "active",
          hue: product.hue,
          images: parseJson(product.images, []),
          options: parseJson(product.options, []),
          variants: product.variants.map((v) => ({ id: v.id, optionValues: parseJson(v.optionValues, []), price: centsToInput(v.priceCents), compareAt: centsToInput(v.compareAtCents), cost: v.costCents === null ? "" : centsToInput(v.costCents), sku: v.sku, stock: v.stock })),
          collectionIds: product.collections.map((c) => c.collectionId),
        }}
      />
    </>
  );
}
