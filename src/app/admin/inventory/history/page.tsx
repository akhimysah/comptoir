import Link from "next/link";
import { Empty, PageHeader, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { PRIMARY, storeLocations } from "@/lib/locations";
import { cx, parseJson } from "@/lib/utils";

/**
 * Historique des ajustements de stock (comme « Afficher l'historique des ajustements » dans Shopify) :
 * les 200 derniers mouvements, pour une variante (?variant=) ou pour tout le catalogue, avec recherche par produit.
 */
export default async function InventoryHistoryPage({ searchParams }: { searchParams: Promise<{ variant?: string; q?: string }> }) {
  const { variant: variantId = "", q = "" } = await searchParams;
  const { store } = await requirePerm("products");
  const variant = variantId ? await db.variant.findFirst({ where: { id: variantId, product: { storeId: store.id } }, include: { product: { select: { id: true, title: true } } } }) : null;
  const rows = await db.inventoryAdjustment.findMany({
    where: { storeId: store.id, ...(variant ? { variantId: variant.id } : {}), ...(q ? { variant: { product: { title: textSearch(q) } } } : {}) },
    include: { variant: { include: { product: { select: { id: true, title: true, images: true, hue: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const locations = await storeLocations(store);
  const locationName = (id: string | null) => (id ? locations.find((l) => l.id === id)?.name ?? (id === PRIMARY ? store.primaryLocationName : "Emplacement supprimé") : "");
  const date = (d: Date) => d.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <PageHeader
        back="/admin/inventory"
        title="Historique des ajustements"
        subtitle={variant ? <>{variant.product.title}{variant.title !== "Par défaut" ? ` · ${variant.title}` : ""} · <Link href={`/admin/products/${variant.product.id}`} className="text-pine hover:underline">Voir le produit</Link></> : "Chaque changement de stock : commandes, remboursements, inventaires, transferts, réceptions fournisseur, API."}
        actions={variant ? <Link href="/admin/inventory/history" className="btn">Tout l'historique</Link> : undefined}
      />
      <section className="card min-w-0 overflow-hidden">
        {!variant && (
          <form className="flex items-center gap-2 border-b border-line px-3 py-2">
            <input name="q" defaultValue={q} className="input h-8 w-64 py-1" placeholder="Rechercher un produit" aria-label="Rechercher un produit" />
            <button className="btn btn-sm">Filtrer</button>
            {q && <Link href="/admin/inventory/history" className="text-xs text-pine hover:underline">Effacer</Link>}
          </form>
        )}
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr><th className="th">Date</th>{!variant && <th className="th">Produit</th>}<th className="th">Motif</th><th className="th">Auteur</th><th className="th">Emplacement</th><th className="th text-right">Variation</th><th className="th text-right">Stock après</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#f7f7f7]">
                    <td className="td whitespace-nowrap text-muted">{date(r.createdAt)}</td>
                    {!variant && (
                      <td className="td">
                        <Link href={`/admin/inventory/history?variant=${r.variantId}`} className="flex items-center gap-3">
                          <Thumb image={r.variant.image ?? parseJson<string[]>(r.variant.product.images, [])[0]} hue={r.variant.product.hue} title={r.variant.product.title} className="h-8 w-8 text-[10px]" />
                          <span>
                            <span className="block whitespace-nowrap font-[550] hover:underline">{r.variant.product.title}</span>
                            {r.variant.title !== "Par défaut" && <span className="mt-0.5 inline-block rounded-md bg-[#ebebeb] px-1.5 text-xs">{r.variant.title}</span>}
                          </span>
                        </Link>
                      </td>
                    )}
                    <td className="td">{r.reason}</td>
                    <td className="td text-muted">{r.author || "—"}</td>
                    <td className="td text-muted">{locationName(r.locationId) || "—"}</td>
                    <td className={cx("td num text-right font-[650]", r.delta > 0 ? "text-[#0c5132]" : r.delta < 0 ? "text-[#8e0b21]" : "text-muted")}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                    <td className="td num text-right">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aucun ajustement">{variant || q ? "Aucun mouvement de stock enregistré pour cette recherche." : "Les mouvements de stock apparaîtront ici dès la prochaine vente, réception ou modification."}</Empty>
        )}
        {rows.length === 200 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Seuls les 200 derniers mouvements sont affichés.</p>}
      </section>
    </>
  );
}
