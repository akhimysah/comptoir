import { notFound } from "next/navigation";
import { Invoice } from "@/components/print/OrderDocs";
import { PrintButton } from "@/components/print/PrintButton";
import { db } from "@/lib/db";

export const metadata = { title: "Facture" };

/** Facture d'une commande. Accessible par son identifiant (introuvable sans lui), comme la page de confirmation. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true, store: true } });
  if (!order || order.paymentStatus === "pending") notFound();
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden"><PrintButton /></div>
      <Invoice store={order.store} order={order} />
    </>
  );
}
