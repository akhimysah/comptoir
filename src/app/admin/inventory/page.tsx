import Link from "next/link";
import { StockInput } from "@/components/admin/StockInput";
import { Empty, PageHeader, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { cx, parseJson } from "@/lib/utils";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { q = "", filter = "all" } = await searchParams;
  const { store } = await requireStore();
  const variants = await db.variant.findMany({
    where: {
      product: { storeId: store.id, ...(q ? { title: { contains: q } } : {}) },
      ...(filter === "low" ? { stock: { gt: 0, lte: 5 } } : filter === "out" ? { stock: { lte: 0 } } : {}),
    },
    include: { product: true },
    orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
  });
  // « Engagé » : articles déjà payés mais pas encore expédiés.
  const committed = await db.orderItem.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variants.map((v) => v.id) }, order: { storeId: store.id, paymentStatus: "paid", fulfillmentStatus: "unfulfilled", cancelledAt: null } },
    _sum: { quantity: true },
  });
  const committedBy = new Map(committed.map((c) => [c.variantId, c._sum.quantity ?? 0]));
  const tabs = [["all", "Tout"], ["low", "Stock faible"], ["out", "En rupture"]] as const;

  return (
    <>
      <PageHeader title="Stock" />
      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          {tabs.map(([k, label]) => (
            <Link key={k} href={`/admin/inventory?filter=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", filter === k ? "bg-[#e3e3e3]" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>{label}</Link>
          ))}
          <form className="ml-auto"><input type="hidden" name="filter" value={filter} /><input name="q" defaultValue={q} className="input h-7 w-48 py-1" placeholder="Rechercher un produit" aria-label="Rechercher un produit" /></form>
        </div>
        {variants.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th className="th">Produit</th><th className="th">SKU</th><th className="th text-right">Engagé</th><th className="th text-right">Disponible</th></tr></thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="hover:bg-[#f7f7f7]">
                    <td className="td">
                      <Link href={`/admin/products/${v.productId}`} className="flex items-center gap-3">
                        <Thumb image={parseJson<string[]>(v.product.images, [])[0]} hue={v.product.hue} title={v.product.title} className="h-9 w-9 text-[10px]" />
                        <span>
                          <span className="block font-[550] hover:underline">{v.product.title}</span>
                          {v.title !== "Par défaut" && <span className="mt-0.5 inline-block rounded-md bg-[#ebebeb] px-1.5 text-xs">{v.title}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="td text-muted">{v.sku || "Aucun SKU"}</td>
                    <td className="td num text-right">{committedBy.get(v.id) ?? 0}</td>
                    <td className="td"><StockInput variantId={v.id} initial={v.stock} label={`${v.product.title} ${v.title}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{q || filter !== "all" ? "Aucun article ne correspond." : "Ajoutez des produits pour suivre leur stock ici."}</Empty>
        )}
      </section>
    </>
  );
}
