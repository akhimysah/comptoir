import { ManualOrderForm } from "@/components/admin/ManualOrderForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Address } from "@/lib/orders";
import { parseJson } from "@/lib/utils";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const { store } = await requirePerm("orders");
  // Commande complémentaire d'une commande existante : même client, même adresse.
  const source = from ? await db.order.findFirst({ where: { id: from, storeId: store.id } }) : null;
  const a = source ? parseJson<Address>(source.address, { line1: "", zip: "", city: "", country: "" }) : null;
  const [variants, customers] = await Promise.all([
    db.variant.findMany({ where: { product: { storeId: store.id } }, include: { product: true }, orderBy: [{ product: { title: "asc" } }, { position: "asc" }] }),
    db.customer.findMany({ where: { storeId: store.id }, include: { orders: { orderBy: { createdAt: "desc" }, take: 1, select: { address: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader back={source ? `/admin/orders/${source.id}` : "/admin/orders"} title={source ? `Commande complémentaire de #${source.number}` : "Créer une commande"} subtitle={source ? "Articles ajoutés après le paiement : le client reçoit une facture avec un lien de paiement." : undefined} />
      <ManualOrderForm
        prefill={source && a ? { name: source.name, email: source.email, ...a, note: `Complément de la commande #${source.number}` } : undefined}
        currency={store.currency}
        variants={variants.map((v) => ({ id: v.id, productTitle: v.product.title, variantTitle: v.title, priceCents: v.priceCents, stock: v.stock, image: parseJson<string[]>(v.product.images, [])[0] ?? null, hue: v.product.hue }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email, address: c.orders[0] ? parseJson<Address | null>(c.orders[0].address, null) : null }))}
      />
    </>
  );
}
