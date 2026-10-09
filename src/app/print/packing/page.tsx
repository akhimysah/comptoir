import { PackingSlip } from "@/components/print/OrderDocs";
import { PrintButton } from "@/components/print/PrintButton";
import { requireUser, storesWithPerm } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Bons de préparation" };

/** Un ou plusieurs bons de préparation : /print/packing?ids=a,b,c (réservé à l'équipe de la boutique). */
export default async function PackingPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = "" } = await searchParams;
  const user = await requireUser();
  const stores = await storesWithPerm(user.id, "orders");
  const orders = await db.order.findMany({
    where: { id: { in: ids.split(",").filter(Boolean).slice(0, 200) }, storeId: { in: stores.map((s) => s.id) } },
    include: { items: true, store: true },
    orderBy: { number: "asc" },
  });
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between print:hidden">
        <span className="text-sm text-[#555]">{orders.length} bon{orders.length > 1 ? "s" : ""} de préparation</span>
        <PrintButton label="Imprimer" />
      </div>
      {orders.map((o) => <PackingSlip key={o.id} store={o.store} order={o} />)}
      {!orders.length && <p className="text-center text-[#555]">Aucune commande à imprimer.</p>}
    </>
  );
}
