import Link from "next/link";
import { Empty, PageHeader, Pill, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "all" } = await searchParams;
  const { store } = await requireStore();
  const products = await db.product.findMany({
    where: { storeId: store.id, ...(status !== "all" ? { status } : {}), ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
    include: { variants: true, collections: { include: { collection: true } } },
    orderBy: { createdAt: "desc" },
  });
  const total = await db.product.count({ where: { storeId: store.id } });

  return (
    <>
      <PageHeader title="Produits" subtitle={`${total} produit${total > 1 ? "s" : ""} dans le catalogue`} actions={<Link href="/admin/products/new" className="btn btn-primary">Ajouter un produit</Link>} />
      {total === 0 ? (
        <div className="card">
          <Empty title="Votre catalogue est vide" action={<Link href="/admin/products/new" className="btn btn-primary">Ajouter un produit</Link>}>
            Ajoutez un produit avec ses photos, ses variantes et son stock. Il apparaît dans la boutique dès qu'il est en ligne.
          </Empty>
        </div>
      ) : (
        <div className="card min-w-0">
          <form className="card-h flex-wrap">
            <input name="q" defaultValue={q} placeholder="Rechercher un produit" className="input max-w-xs" aria-label="Rechercher un produit" />
            <div className="flex gap-2">
              <select name="status" defaultValue={status} className="input w-auto" aria-label="Statut">
                <option value="all">Tous les statuts</option>
                <option value="active">En ligne</option>
                <option value="draft">Brouillons</option>
              </select>
              <button className="btn">Filtrer</button>
            </div>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr><th className="th">Produit</th><th className="th">Statut</th><th className="th">Stock</th><th className="th hidden md:table-cell">Collections</th><th className="th text-right">Prix</th></tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
                  const prices = p.variants.map((v) => v.priceCents);
                  const min = Math.min(...prices), max = Math.max(...prices);
                  return (
                    <tr key={p.id} className="hover:bg-[#F3F6F4]">
                      <td className="td">
                        <Link href={`/admin/products/${p.id}`} className="flex min-w-[220px] items-center gap-3">
                          <Thumb image={parseJson<string[]>(p.images, [])[0]} hue={p.hue} title={p.title} className="h-10 w-10 text-xs" />
                          <span>
                            <span className="block font-semibold">{p.title}</span>
                            {p.variants.length > 1 && <span className="text-xs text-muted">{p.variants.length} variantes</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="td">{p.status === "active" ? <Pill tone="ok">En ligne</Pill> : <Pill>Brouillon</Pill>}</td>
                      <td className="td">{stock <= 0 ? <Pill tone="bad">Rupture</Pill> : <span className="num whitespace-nowrap">{stock}<span className="text-muted"> en stock</span></span>}</td>
                      <td className="td hidden text-muted md:table-cell">{p.collections.map((c) => c.collection.title).join(", ") || "—"}</td>
                      <td className="td num text-right">{min === max ? formatMoney(min, store.currency) : `${formatMoney(min, store.currency)} – ${formatMoney(max, store.currency)}`}</td>
                    </tr>
                  );
                })}
                {!products.length && <tr><td colSpan={5}><Empty>Aucun produit ne correspond à cette recherche.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
