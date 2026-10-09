import { PosRegister } from "@/components/admin/PosRegister";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { bundleComponents, bundleStock } from "@/lib/bundles";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";

export default async function PosPage() {
  const { store } = await requirePerm("orders");
  const [products, collections, customers] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: "active" }, include: { variants: { orderBy: { position: "asc" } }, collections: { include: { collection: true } } }, orderBy: { title: "asc" } }),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" } }),
    db.customer.findMany({ where: { storeId: store.id }, select: { email: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  const bundles = await bundleComponents(products.map((p) => p.id));
  return (
    <>
      <PageHeader title="Point de vente" subtitle="Encaissez en boutique ou sur un marché : le stock et les clients sont partagés avec la boutique en ligne." />
      <PosRegister
        currency={store.currency}
        collections={collections.map((c) => ({ handle: c.handle, title: c.title }))}
        customers={customers}
        products={products.map((p) => ({
          id: p.id, title: p.title, hue: p.hue, image: parseJson<string[]>(p.images, [])[0] ?? null,
          collections: p.collections.map((c) => c.collection.handle),
          variants: p.variants.map((v) => ({ id: v.id, title: v.title, priceCents: v.priceCents, stock: bundles.has(p.id) ? bundleStock(bundles.get(p.id)!) : v.stock, unlimited: p.isGiftCard || p.continueSelling })),
        }))}
      />
    </>
  );
}
