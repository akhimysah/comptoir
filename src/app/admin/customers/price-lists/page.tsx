import Link from "next/link";
import { createPriceList } from "./actions";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Listes de prix pro" };

export default async function PriceListsPage() {
  const { store } = await requirePerm("customers");
  const lists = await db.priceList.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { prices: true, customers: true } } } });
  return (
    <>
      <PageHeader back="/admin/customers" title="Listes de prix pro" subtitle="Vendez aux professionnels (revendeurs, restaurants, entreprises) à leurs propres prix. Attribuez une liste depuis la fiche du client." />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          {lists.length ? (
            <table className="w-full">
              <thead><tr><th className="th">Liste</th><th className="th">Réduction générale</th><th className="th text-right">Prix fixes</th><th className="th text-right">Clients</th></tr></thead>
              <tbody>
                {lists.map((l) => (
                  <tr key={l.id} className="hover:bg-[#f7f7f7]">
                    <td className="td"><Link href={`/admin/customers/price-lists/${l.id}`} className="font-[650] hover:underline">{l.name}</Link></td>
                    <td className="td">{l.percentOff ? `−${l.percentOff} % sur tout le catalogue` : <span className="text-muted">Aucune</span>}</td>
                    <td className="td num text-right">{l._count.prices}</td>
                    <td className="td num text-right">{l._count.customers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-8 text-center text-muted">Aucune liste pour le moment. Créez par exemple « Revendeurs » avec −30 % sur tout le catalogue.</p>
          )}
        </section>
        <form action={createPriceList} className="card flex flex-col gap-3 self-start p-4">
          <h2 className="text-sm font-[650]">Nouvelle liste</h2>
          <label className="label">Nom<input name="name" required maxLength={60} className="input" placeholder="Revendeurs" /></label>
          <label className="label">Réduction générale (%)<span className="hint">Sur tous les produits, sauf ceux qui ont un prix fixe dans la liste.</span><input name="percentOff" type="number" min={0} max={90} defaultValue={0} className="input num" /></label>
          <button className="btn btn-primary self-end">Créer la liste</button>
        </form>
      </div>
    </>
  );
}
