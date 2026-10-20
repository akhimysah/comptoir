import Link from "next/link";
import { Empty, PageHeader, Pill, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { bundleComponents, bundleStock } from "@/lib/bundles";
import { formatMoney } from "@/lib/money";
import { cx, parseJson } from "@/lib/utils";

/** Balises « a, b » → ["a", "b"]. */
const splitTags = (tags: string) => tags.split(",").map((t) => t.trim()).filter(Boolean);

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; vendor?: string; type?: string; tag?: string }> }) {
  const { q = "", status = "all", vendor = "", type = "", tag = "" } = await searchParams;
  const { store } = await requirePerm("products");
  // La recherche porte sur le titre, le fournisseur, le type et les balises (comme Shopify) ; les pastilles filtrent sur une valeur exacte.
  const products = (await db.product.findMany({
    where: {
      storeId: store.id,
      ...(status !== "all" ? { status } : {}),
      ...(q ? { OR: [{ title: textSearch(q) }, { vendor: textSearch(q) }, { productType: textSearch(q) }, { tags: textSearch(q) }, { category: textSearch(q) }] } : {}),
      ...(vendor ? { vendor } : {}),
      ...(type ? { productType: type } : {}),
      ...(tag ? { tags: textSearch(tag) } : {}),
    },
    include: { variants: true, collections: { include: { collection: true } } },
    orderBy: { createdAt: "desc" },
  })).filter((p) => !tag || splitTags(p.tags).some((t) => t.toLowerCase() === tag.toLowerCase()));
  const total = await db.product.count({ where: { storeId: store.id } });
  // Valeurs disponibles pour les pastilles de filtre (fournisseurs, types, balises du catalogue).
  const organisation = await db.product.findMany({ where: { storeId: store.id }, select: { vendor: true, productType: true, tags: true } });
  const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).slice(0, 12);
  const vendors = distinct(organisation.map((p) => p.vendor));
  const types = distinct(organisation.map((p) => p.productType));
  const tags = distinct(organisation.flatMap((p) => splitTags(p.tags)));
  const filterHref = (patch: Partial<{ vendor: string; type: string; tag: string }>) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}), ...(vendor ? { vendor } : {}), ...(type ? { type } : {}), ...(tag ? { tag } : {}) });
    for (const [k, v] of Object.entries(patch)) v ? params.set(k, v) : params.delete(k);
    const qs = params.toString();
    return `/admin/products${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) => cx("rounded-full border px-2.5 py-0.5 text-xs font-[550] whitespace-nowrap", active ? "border-ink bg-ink text-white" : "border-line text-muted hover:bg-[#f1f1f1] hover:text-ink");
  const bundles = await bundleComponents(products.map((p) => p.id));
  const stockOf = (p: (typeof products)[number]) => (bundles.has(p.id) ? bundleStock(bundles.get(p.id)!) : p.variants.reduce((s, v) => s + v.stock, 0));

  return (
    <>
      <PageHeader title="Produits" subtitle={`${total} produit${total > 1 ? "s" : ""} dans le catalogue`} actions={<><a href="/admin/products/export" className="btn">Exporter</a><Link href="/admin/products/import" className="btn">Importer</Link><Link href="/admin/products/new" className="btn btn-primary">Ajouter un produit</Link></>} />
      {total === 0 ? (
        <div className="card">
          <Empty title="Votre catalogue est vide" action={<Link href="/admin/products/new" className="btn btn-primary">Ajouter un produit</Link>}>
            Ajoutez un produit avec ses photos, ses variantes et son stock. Il apparaît dans la boutique dès qu'il est en ligne.
          </Empty>
        </div>
      ) : (
        <div className="card min-w-0">
          <form className="card-h flex-wrap">
            <input name="q" defaultValue={q} placeholder="Rechercher un produit, un fournisseur, un type, une balise" className="input max-w-xs" aria-label="Rechercher un produit" />
            {vendor && <input type="hidden" name="vendor" value={vendor} />}
            {type && <input type="hidden" name="type" value={type} />}
            {tag && <input type="hidden" name="tag" value={tag} />}
            <div className="flex gap-2">
              <select name="status" defaultValue={status} className="input w-auto" aria-label="Statut">
                <option value="all">Tous les statuts</option>
                <option value="active">Actifs</option>
                <option value="draft">Brouillons</option>
              </select>
              <button className="btn">Filtrer</button>
            </div>
          </form>
          {(vendors.length > 0 || types.length > 0 || tags.length > 0) && (
            <div className="flex flex-col gap-1.5 border-b border-line px-3 py-2">
              {vendors.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-muted">Fournisseur :</span>{vendors.map((v) => <Link key={v} href={filterHref({ vendor: vendor === v ? "" : v })} className={chip(vendor === v)}>{v}</Link>)}</div>}
              {types.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-muted">Type :</span>{types.map((t) => <Link key={t} href={filterHref({ type: type === t ? "" : t })} className={chip(type === t)}>{t}</Link>)}</div>}
              {tags.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-muted">Balise :</span>{tags.map((t) => <Link key={t} href={filterHref({ tag: tag === t ? "" : t })} className={chip(tag === t)}>{t}</Link>)}</div>}
              {(vendor || type || tag) && <Link href={filterHref({ vendor: "", type: "", tag: "" })} className="self-start text-xs text-pine hover:underline">Effacer les filtres</Link>}
            </div>
          )}
          <ul className="md:hidden">
            {products.map((p) => {
              const stock = stockOf(p);
              return (
                <li key={p.id} className="border-b border-line last:border-0">
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 px-3 py-2.5">
                    <Thumb image={parseJson<string[]>(p.images, [])[0]} hue={p.hue} title={p.title} className="h-10 w-10 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-[550]">{p.title}</span>
                      <span className="text-xs text-muted">{stock} en stock{p.variants.length > 1 ? ` · ${p.variants.length} variantes` : ""}</span>
                    </span>
                    {p.status === "active" ? <Pill tone="ok">Actif</Pill> : <Pill>Brouillon</Pill>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr><th className="th">Produit</th><th className="th">Statut</th><th className="th">Stock</th><th className="th hidden lg:table-cell">Catégorie</th><th className="th hidden lg:table-cell">Type de produit</th><th className="th hidden lg:table-cell">Fournisseur</th><th className="th hidden md:table-cell">Collections</th><th className="th text-right">Prix</th></tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const stock = stockOf(p);
                  const prices = p.variants.map((v) => v.priceCents);
                  const min = Math.min(...prices), max = Math.max(...prices);
                  return (
                    <tr key={p.id} className="hover:bg-[#f7f7f7]">
                      <td className="td">
                        <Link href={`/admin/products/${p.id}`} className="flex min-w-[220px] items-center gap-3">
                          <Thumb image={parseJson<string[]>(p.images, [])[0]} hue={p.hue} title={p.title} className="h-10 w-10 text-xs" />
                          <span>
                            <span className="block font-semibold">{p.title}</span>
                            {bundles.has(p.id) ? <span className="text-xs text-muted">Lot de {bundles.get(p.id)!.length} produit{bundles.get(p.id)!.length > 1 ? "s" : ""}</span> : p.variants.length > 1 && <span className="text-xs text-muted">{p.variants.length} variantes</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="td">{p.status === "active" ? <Pill tone="ok">Actif</Pill> : <Pill>Brouillon</Pill>}</td>
                      <td className="td">{stock <= 0 ? <Pill tone="bad">Rupture</Pill> : <span className="num whitespace-nowrap">{stock}<span className="text-muted"> en stock</span></span>}</td>
                      <td className="td hidden text-muted lg:table-cell">{p.category || "—"}</td>
                      <td className="td hidden text-muted lg:table-cell">{p.productType ? <Link href={filterHref({ type: p.productType })} className="hover:underline">{p.productType}</Link> : "—"}</td>
                      <td className="td hidden text-muted lg:table-cell">{p.vendor ? <Link href={filterHref({ vendor: p.vendor })} className="hover:underline">{p.vendor}</Link> : "—"}</td>
                      <td className="td hidden text-muted md:table-cell">{p.collections.map((c) => c.collection.title).join(", ") || "—"}</td>
                      <td className="td num text-right">{min === max ? formatMoney(min, store.currency) : `${formatMoney(min, store.currency)} – ${formatMoney(max, store.currency)}`}</td>
                    </tr>
                  );
                })}
                {!products.length && <tr><td colSpan={8}><Empty>Aucun produit ne correspond à cette recherche.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
