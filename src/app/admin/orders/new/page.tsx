import { ManualOrderForm } from "@/components/admin/ManualOrderForm";
import { PageHeader } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Address } from "@/lib/orders";
import { parseJson } from "@/lib/utils";

export default async function NewOrderPage() {
  const { store } = await requireStore();
  const [variants, customers] = await Promise.all([
    db.variant.findMany({ where: { product: { storeId: store.id } }, include: { product: true }, orderBy: [{ product: { title: "asc" } }, { position: "asc" }] }),
    db.customer.findMany({ where: { storeId: store.id }, include: { orders: { orderBy: { createdAt: "desc" }, take: 1, select: { address: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader back="/admin/orders" title="Créer une commande" />
      <ManualOrderForm
        currency={store.currency}
        variants={variants.map((v) => ({ id: v.id, productTitle: v.product.title, variantTitle: v.title, priceCents: v.priceCents, stock: v.stock, image: parseJson<string[]>(v.product.images, [])[0] ?? null, hue: v.product.hue }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email, address: c.orders[0] ? parseJson<Address | null>(c.orders[0].address, null) : null }))}
      />
    </>
  );
}
