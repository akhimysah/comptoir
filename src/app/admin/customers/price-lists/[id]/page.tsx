import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePriceList, savePriceList } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export default async function PriceListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; saved?: string }> }) {
  const [{ id }, { q = "", saved }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("customers");
  const list = await db.priceList.findFirst({ where: { id, storeId: store.id }, include: { prices: true, customers: { select: { id: true, name: true, company: true }, take: 50 } } });
  if (!list) notFound();
  const products = await db.product.findMany({
    where: { storeId: store.id, isGiftCard: false, ...(q ? { title: textSearch(q) } : {}) },
    include: { variants: { orderBy: { position: "asc" } } },
    orderBy: { title: "asc" },
    take: 100,
  });
  const fixed = new Map(list.prices.map((p) => [p.variantId, p.priceCents]));
  const m = (c: number) => formatMoney(c, store.currency);
  const amount = (c: number) => (c / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <PageHeader back="/admin/customers/price-lists" title={list.name} subtitle={`${list.customers.length} client${list.customers.length > 1 ? "s" : ""} · ${list.prices.length} prix fixe${list.prices.length > 1 ? "s" : ""}`}
        actions={<form action={deletePriceList}><input type="hidden" name="id" value={list.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Supprimer la liste" className="h-8" /></form>} />
      {saved && <p role="status" className="mb-4 rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">Liste enregistrée.</p>}
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Filtrer les produits" aria-label="Filtrer les produits" className="input h-8 w-64" />
        <button className="btn h-8">Filtrer</button>
      </form>
      <form action={savePriceList} className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <input type="hidden" name="id" value={list.id} />
        <input type="hidden" name="q" value={q} />
        <section className="card min-w-0 overflow-hidden">
          <div className="card-h flex-wrap gap-2">
            <h2 className="text-sm font-[650]">Prix fixes</h2>
            <span className="text-xs text-muted">Laissez vide pour appliquer la réduction générale. Prix TTC.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">Produit</th><th className="th text-right">Prix public</th><th className="th text-right">Avec la réduction</th><th className="th w-36 text-right">Prix fixe</th></tr></thead>
              <tbody>
                {products.flatMap((p) => p.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Thumb image={v.image ?? parseJson<string[]>(p.images, [])[0] ?? null} hue={p.hue} title={p.title} className="h-8 w-8 text-[10px]" />
                        <span className="min-w-0"><span className="font-[550]">{p.title}</span>{v.title !== "Par défaut" && <span className="text-muted"> · {v.title}</span>}</span>
                      </div>
                    </td>
                    <td className="td num text-right text-muted">{m(v.priceCents)}</td>
                    <td className="td num text-right text-muted">{list.percentOff ? m(Math.round((v.priceCents * (100 - list.percentOff)) / 100)) : "—"}</td>
                    <td className="td text-right">
                      <input type="hidden" name="variantId" value={v.id} />
                      <input name={`price_${v.id}`} defaultValue={fixed.has(v.id) ? amount(fixed.get(v.id)!) : ""} inputMode="decimal" aria-label={`Prix fixe de ${p.title} ${v.title}`} placeholder="—" className="input num h-8 w-28 text-right" />
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          {!products.length && <p className="px-4 py-8 text-center text-muted">Aucun produit{q ? ` pour « ${q} »` : ""}.</p>}
        </section>
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4">
            <label className="label">Nom<input name="name" defaultValue={list.name} maxLength={60} className="input" /></label>
            <label className="label">Réduction générale (%)<input name="percentOff" type="number" min={0} max={90} defaultValue={list.percentOff} className="input num" /></label>
            <p className="text-xs text-muted">Un prix fixe plus élevé que le prix public n'est jamais appliqué : le client paie toujours le moins cher des deux.</p>
            <button className="btn btn-primary self-end">Enregistrer</button>
          </section>
          <section className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-[650]">Clients</h2>
            {list.customers.length ? (
              <ul className="flex flex-col gap-1 text-[13px]">{list.customers.map((c) => <li key={c.id}><Link href={`/admin/customers/${c.id}`} className="text-pine hover:underline">{c.company || c.name}</Link></li>)}</ul>
            ) : <p className="text-[13px] text-muted">Aucun client. Ouvrez la fiche d'un client et choisissez cette liste dans « Client professionnel ».</p>}
          </section>
        </aside>
      </form>
    </>
  );
}
