import { notFound, redirect } from "next/navigation";
import { RefundForm } from "./RefundForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { PAID_STATUSES, refundableCents, suggestedItemRefund } from "@/lib/refunds";

export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("orders");
  const o = await db.order.findFirst({ where: { id, storeId: store.id }, include: { items: true } });
  if (!o) notFound();
  if (!PAID_STATUSES.includes(o.paymentStatus) || refundableCents(o) === 0) redirect(`/admin/orders/${o.id}`);
  return (
    <>
      <PageHeader back={`/admin/orders/${o.id}`} title={`Rembourser #${o.number}`} subtitle="Choisissez les articles retournés ou indiquez directement un montant." />
      <RefundForm
        orderId={o.id}
        currency={store.currency}
        refundable={refundableCents(o)}
        shippingPaid={o.shippingCents}
        stripe={o.paymentMethod === "stripe"}
        items={o.items.map((i) => ({ id: i.id, title: i.productTitle, variant: i.variantTitle, priceCents: i.priceCents, remaining: i.quantity - i.refundedQuantity, suggestedUnit: suggestedItemRefund(o, i.priceCents, 1), image: i.image, hue: i.hue }))}
      />
    </>
  );
}
