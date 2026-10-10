import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bundleChoicesFor } from "@/lib/bundle-choices";

export default async function NewProductPage() {
  const { store } = await requirePerm("products");
  const choices = await bundleChoicesFor(store.id);
  const collections = await db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  const fieldDefs = await db.metafieldDefinition.findMany({ where: { storeId: store.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return (
    <>
      <PageHeader back="/admin/products" title="Ajouter un produit" />
      <ProductForm
        currency={store.currency}
        collections={collections}
        storeUrl={`${appUrl()}/s/${store.slug}`}
        bundleChoices={choices}
        fieldDefs={fieldDefs}
        initial={{ title: "", description: "", status: "active", hue: Math.floor(Math.random() * 360), images: [], options: [], variants: [{ optionValues: [], price: "", compareAt: "", cost: "", sku: "", stock: 10 }], collectionIds: [] }}
      />
    </>
  );
}
