import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderEditor } from "@/components/admin/OrderEditor";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { editBlocker } from "@/lib/order-edit";
import { parseJson } from "@/lib/utils";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("orders");
  const o = await db.order.findFirst({ where: { id, storeId: store.id }, include: { items: true } });
  if (!o) notFound();
  const blocker = editBlocker(o);

  if (blocker) {
    return (
      <>
        <PageHeader back={`/admin/orders/${o.id}`} title={`Modifier #${o.number}`} />
        <section className="card flex max-w-2xl flex-col gap-3 p-5">
          {blocker === "paid" ? (
            <>
              <p className="font-[550]">Cette commande est déjà payée.</p>
              <p className="text-[13px] text-muted">Pour ne pas fausser les montants encaissés, une commande payée ne se modifie pas directement :</p>
              <ul className="flex flex-col gap-2 text-[13px]">
                <li><b>Retirer ou réduire des articles</b> : remboursez-les (remise en stock possible).</li>
                <li><b>Ajouter des articles</b> : créez une commande complémentaire, le client reçoit une facture avec un lien de paiement.</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                {o.totalCents - o.refundedCents > 0 && !o.cancelledAt && <Link href={`/admin/orders/${o.id}/refund`} className="btn">Rembourser des articles</Link>}
                <Link href={`/admin/orders/new?from=${o.id}`} className="btn btn-primary">Créer une commande complémentaire</Link>
              </div>
            </>
          ) : <p>{blocker}</p>}
        </section>
      </>
    );
  }

  const [variants, discount] = await Promise.all([
    db.variant.findMany({ where: { product: { storeId: store.id, status: { not: "archived" } } }, include: { product: true }, orderBy: [{ product: { title: "asc" } }, { position: "asc" }] }),
    o.discountId ? db.discount.findUnique({ where: { id: o.discountId } }) : null,
  ]);
  return (
    <>
      <PageHeader back={`/admin/orders/${o.id}`} title={`Modifier #${o.number}`} subtitle="Commande non payée : changez les quantités, retirez ou ajoutez des articles. Les articles ajoutés sont au prix actuel." />
      <OrderEditor
        orderId={o.id}
        currency={store.currency}
        shippingCents={o.shippingCents}
        invoiceSent={Boolean(o.invoiceSentAt)}
        discount={discount?.type === "percent" ? { kind: "percent", value: discount.value } : o.discountCents > 0 ? { kind: "fixed", value: o.discountCents } : { kind: "none", value: 0 }}
        items={o.items.map((i) => ({ id: i.id, title: i.productTitle, variant: i.variantTitle, priceCents: i.priceCents, quantity: i.quantity, image: i.image, hue: i.hue }))}
        variants={variants.map((v) => ({ id: v.id, title: v.product.title, variant: v.title, priceCents: v.priceCents, stock: v.stock, image: parseJson<string[]>(v.product.images, [])[0] ?? null, hue: v.product.hue }))}
      />
    </>
  );
}
