import Link from "next/link";
import { StockInput } from "@/components/admin/StockInput";
import { Empty, PageHeader, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { cx, parseJson } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { incomingByVariant } from "@/lib/purchasing";
import { pendingAlertsByVariant } from "@/lib/stock-alerts";
import { PRIMARY, stockByLocation, storeLocations } from "@/lib/locations";
import { transfer } from "./actions";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; loc?: string; err?: string; ok?: string }> }) {
  const { q = "", filter = "all", loc = PRIMARY, err, ok } = await searchParams;
  const { store } = await requirePerm("products");
  // Plusieurs emplacements : la page montre et modifie le stock de l'emplacement choisi.
  const locations = await storeLocations(store);
  const current = locations.find((l) => l.id === loc) ?? locations[0];
  const multi = locations.length > 1;
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
  const perLocation = multi ? await stockByLocation(store.id, variants) : null;
  const here = (v: { id: string; stock: number }) => perLocation?.get(v.id)?.get(current.id) ?? v.stock;
  const tabs = [["all", "Tout"], ["low", "Stock faible"], ["out", "En rupture"]] as const;

  return (
    <>
      <PageHeader title="Stock" subtitle={value > 0 ? `Valeur du stock au prix d'achat : ${formatMoney(value, store.currency)}${withoutCost ? ` (${withoutCost} article${withoutCost > 1 ? "s" : ""} sans coût renseigné)` : ""}` : "Renseignez le coût par article de vos produits pour connaître la valeur de votre stock."} actions={<><Link href="/admin/inventory/history" className="btn">Historique</Link><Link href="/admin/products/purchase-orders/new" className="btn">Commander au fournisseur</Link></>} />
      {err && <p role="alert" className="rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}
      {ok && <p role="status" className="rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">Transfert effectué.</p>}
      {multi && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[13px] text-muted">Emplacement :</span>
          {locations.map((l) => <Link key={l.id} href={`/admin/inventory?loc=${l.id}&filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", current.id === l.id ? "bg-[#e3e3e3]" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>{l.name}</Link>)}
        </div>
      )}
      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          {tabs.map(([k, label]) => (
            <Link key={k} href={`/admin/inventory?filter=${k}&loc=${current.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", filter === k ? "bg-[#e3e3e3]" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>{label}</Link>
          ))}
          <form className="ml-auto"><input type="hidden" name="filter" value={filter} /><input type="hidden" name="loc" value={current.id} /><input name="q" defaultValue={q} className="input h-7 w-48 py-1" placeholder="Rechercher un produit" aria-label="Rechercher un produit" /></form>
        </div>
        {variants.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead><tr><th className="th">Produit</th><th className="th">SKU</th><th className="th text-right">Engagé</th><th className="th text-right">À recevoir</th><th className="th text-right" title="Clients qui ont demandé à être prévenus du retour en stock">En attente</th>{multi && <th className="th text-right">Total</th>}<th className="th text-right" title="Disponible + engagé">En stock</th><th className="th text-right">{multi ? `Disponible · ${current.name}` : "Disponible"}</th><th className="th" /></tr></thead>
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
                    {multi && <td className="td num text-right text-muted" title={locations.map((l) => `${l.name} : ${perLocation?.get(v.id)?.get(l.id) ?? 0}`).join(" · ")}>{v.stock}</td>}
                    {/* « En stock » comme Shopify : ce qui est disponible plus ce qui est déjà engagé par des commandes payées. */}
                    <td className="td num text-right text-muted">{v.stock + (committedBy.get(v.id) ?? 0)}</td>
                    <td className="td"><StockInput key={`${v.id}-${current.id}`} variantId={v.id} initial={here(v)} label={`${v.product.title} ${v.title}`} locationId={current.id} /></td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/inventory/history?variant=${v.id}`} className="whitespace-nowrap text-xs text-pine hover:underline" title="Afficher l'historique des ajustements">Historique</Link>
                    {multi && (
                        <details className="relative">
                          <summary className="btn btn-sm cursor-pointer list-none">Transférer</summary>
                          <form action={transfer} className="absolute right-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-lg border border-line bg-white p-3 shadow-lg">
                            <input type="hidden" name="variantId" value={v.id} /><input type="hidden" name="from" value={current.id} />
                            <span className="text-xs text-muted">Depuis {current.name} ({here(v)} disponible{here(v) > 1 ? "s" : ""})</span>
                            <label className="label">Vers<select name="to" className="input">{locations.filter((l) => l.id !== current.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                            <label className="label">Quantité<input name="qty" type="number" min={1} max={Math.max(1, here(v))} defaultValue={1} required className="input num" /></label>
                            <button className="btn btn-primary">Transférer</button>
                          </form>
                        </details>
                    )}
                      </div>
                    </td>
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
