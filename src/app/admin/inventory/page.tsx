import Link from "next/link";
import { StockInput } from "@/components/admin/StockInput";
import { Empty, PageHeader, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { cx, parseJson } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { incomingByVariant } from "@/lib/purchasing";
import { pendingAlertsByVariant } from "@/lib/stock-alerts";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { q = "", filter = "all" } = await searchParams;
  const { store } = await requirePerm("products");
  const variants = await db.variant.findMany({
    where: {
      product: { storeId: store.id, isGiftCard: false, bundleItems: { none: {} }, ...(q ? { title: textSearch(q) } : {}) },
      ...(filter === "low" ? { stock: { gt: 0, lte: store.lowStockThreshold } } : filter === "out" ? { stock: { lte: 0 } } : {}),
    },
    include: { product: true },
    orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
  });
  // « Engagé » : articles déjà payés mais pas encore expédiés.
  const committed = await db.orderItem.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variants.map((v) => v.id) }, order: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, fulfillmentStatus: "unfulfilled", cancelledAt: null } },
    _sum: { quantity: true },
  });
  const committedBy = new Map(committed.map((c) => [c.variantId, c._sum.quantity ?? 0]));
  const incoming = await incomingByVariant(store.id);
  const waiting = await pendingAlertsByVariant(store.id);
  // Valeur du stock au prix d'achat (articles dont le coût est renseigné).
  const all = await db.variant.findMany({ where: { product: { storeId: store.id, isGiftCard: false, bundleItems: { none: {} } }, stock: { gt: 0 } }, select: { stock: true, costCents: true } });
  const value = all.reduce((s, v) => s + (v.costCents ?? 0) * v.stock, 0);
  const withoutCost = all.filter((v) => v.costCents === null).length;
  const tabs = [["all", "Tout"], ["low", "Stock faible"], ["out", "En rupture"]] as const;

  return (
    <>
      <PageHeader title="Stock" subtitle={value > 0 ? `Valeur du stock au prix d'achat : ${formatMoney(value, store.currency)}${withoutCost ? ` (${withoutCost} article${withoutCost > 1 ? "s" : ""} sans coût renseigné)` : ""}` : "Renseignez le coût par article de vos produits pour connaître la valeur de votre stock."} actions={<Link href="/admin/products/purchase-orders/new" className="btn">Commander au fournisseur</Link>} />
      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          {tabs.map(([k, label]) => (
            <Link key={k} href={`/admin/inventory?filter=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", filter === k ? "bg-[#e3e3e3]" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>{label}</Link>
          ))}
          <form className="ml-auto"><input type="hidden" name="filter" value={filter} /><input name="q" defaultValue={q} className="input h-7 w-48 py-1" placeholder="Rechercher un produit" aria-label="Rechercher un produit" /></form>
        </div>
        {variants.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead><tr><th className="th">Produit</th><th className="th">SKU</th><th className="th text-right">Engagé</th><th className="th text-right">À recevoir</th><th className="th text-right" title="Clients qui ont demandé à être prévenus du retour en stock">En attente</th><th className="th text-right">Disponible</th></tr></thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="hover:bg-[#f7f7f7]">
                    <td className="td">
                      <Link href={`/admin/products/${v.productId}`} className="flex items-center gap-3">
                        <Thumb image={(v.image ?? parseJson<string[]>(v.product.images, [])[0])} hue={v.product.hue} title={v.product.title} className="h-9 w-9 text-[10px]" />
                        <span>
                          <span className="block whitespace-nowrap font-[550] hover:underline">{v.product.title}</span>
                          {v.title !== "Par défaut" && <span className="mt-0.5 inline-block rounded-md bg-[#ebebeb] px-1.5 text-xs">{v.title}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="td text-muted">{v.sku || "Aucun SKU"}</td>
                    <td className="td num text-right">{committedBy.get(v.id) ?? 0}</td>
                    <td className="td num text-right">{incoming.get(v.id) ? <Link href="/admin/products/purchase-orders" className="text-pine hover:underline">{incoming.get(v.id)}</Link> : <span className="text-muted">0</span>}</td>
                    <td className="td num text-right">{waiting.get(v.id) ? <span className="rounded-md bg-[#ffeb78] px-1.5 text-xs font-[550] text-[#4f4700]">{waiting.get(v.id)}</span> : <span className="text-muted">0</span>}</td>
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
