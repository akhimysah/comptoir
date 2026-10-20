import { notFound, redirect } from "next/navigation";
import { RefundForm } from "./RefundForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { PAID_STATUSES, refundableCents, suggestedItemRefund } from "@/lib/refunds";
import { returnLines } from "@/lib/returns";

export default async function RefundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
  const [{ id }, { return: returnId }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("orders");
  const o = await db.order.findFirst({ where: { id, storeId: store.id }, include: { items: true } });
  if (!o) notFound();
  if (!PAID_STATUSES.includes(o.paymentStatus) || refundableCents(o) === 0) redirect(`/admin/orders/${o.id}`);
  // Depuis un retour accepté ou reçu : les articles retournés sont présélectionnés.
  const ret = returnId ? await db.returnRequest.findFirst({ where: { id: returnId, orderId: o.id, status: { in: ["approved", "received"] } } }) : null;
  const lines = ret ? returnLines(ret) : [];
  const initialQty = Object.fromEntries(lines.map((l) => { const i = o.items.find((x) => x.id === l.orderItemId); return [l.orderItemId, Math.min(l.quantity, i ? i.quantity - i.refundedQuantity : 0)]; }));
  return (
    <>
      <PageHeader back={`/admin/orders/${o.id}`} title={`Rembourser #${o.number}`} subtitle={ret ? `Retour ${ret.status === "received" ? "reçu" : "accepté"} : les articles retournés sont présélectionnés.` : "Choisissez les articles retournés ou indiquez directement un montant."} />
      <RefundForm
        orderId={o.id}
        currency={store.currency}
        refundable={refundableCents(o)}
        shippingPaid={o.shippingCents}
        stripe={o.paymentMethod === "stripe"}
        storeCredit={store.storeCreditEnabled && Boolean(o.customerId)}
        returnId={ret?.id}
        initialQty={ret ? initialQty : undefined}
        initialReason={ret ? `Retour : ${[...new Set(lines.map((l) => l.reason))].join(", ")}`.slice(0, 300) : undefined}
        items={o.items.map((i) => ({ id: i.id, title: i.productTitle, variant: i.variantTitle, priceCents: i.priceCents, remaining: i.quantity - i.refundedQuantity, suggestedUnit: suggestedItemRefund(o, i.priceCents, 1), image: i.image, hue: i.hue }))}
      />
    </>
  );
}
