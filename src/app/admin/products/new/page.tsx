import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function NewProductPage() {
  const { store } = await requireStore();
  const collections = await db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  return (
    <>
      <PageHeader back="/admin/products" title="Ajouter un produit" />
      <ProductForm
        currency={store.currency}
        collections={collections}
        initial={{ title: "", description: "", status: "active", hue: Math.floor(Math.random() * 360), images: [], options: [], variants: [{ optionValues: [], price: "", compareAt: "", sku: "", stock: 10 }], collectionIds: [] }}
      />
    </>
  );
}
