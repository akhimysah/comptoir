import { deleteLocation, saveLocation } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRIMARY, storeLocations } from "@/lib/locations";

export const metadata = { title: "Emplacements" };

export default async function LocationsPage() {
  const { store } = await requireOwner();
  const locations = await storeLocations(store);
  const totals = new Map((await db.inventoryLevel.groupBy({ by: ["locationId"], where: { location: { storeId: store.id } }, _sum: { quantity: true } })).map((t) => [t.locationId, t._sum.quantity ?? 0]));
  const all = (await db.variant.aggregate({ where: { product: { storeId: store.id, isGiftCard: false } }, _sum: { stock: true } }))._sum.stock ?? 0;
  const others = [...totals.values()].reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader back="/admin/settings" title="Emplacements" subtitle="Les lieux où vous gardez du stock : entrepôt, boutique, dépôt chez un partenaire… Les ventes en ligne partent de l'emplacement principal ; choisissez l'emplacement à l'expédition et au point de vente." />
      <section className="card mb-4 overflow-hidden">
        <ul>
          {locations.map((l) => (
            <li key={l.id} className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3 last:border-0">
              <form action={saveLocation} className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={l.id} />
                <label className="label min-w-48 flex-1">Nom<input name="name" defaultValue={l.name} required maxLength={60} className="input" /></label>
                {l.id !== PRIMARY && <label className="label min-w-48 flex-1">Adresse<input name="address" defaultValue={l.address} maxLength={300} className="input" /></label>}
                <button className="btn">Enregistrer</button>
              </form>
              <div className="flex items-center gap-2 pb-1.5">
                <span className="num text-[13px] text-muted">{l.id === PRIMARY ? all - others : totals.get(l.id) ?? 0} article(s)</span>
                {l.id === PRIMARY ? <Pill tone="info" dot={false}>Principal · ventes en ligne</Pill> : (
                  <form action={deleteLocation}><input type="hidden" name="id" value={l.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Supprimer (stock rendu au principal)" className="h-8" /></form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <form action={saveLocation} className="card flex max-w-xl flex-col gap-3 p-4">
        <h2 className="text-sm font-[650]">Ajouter un emplacement</h2>
        <label className="label">Nom<input name="name" required maxLength={60} placeholder="Boutique de Lyon" className="input" /></label>
        <label className="label">Adresse <span className="hint">Facultatif</span><input name="address" maxLength={300} className="input" /></label>
        <p className="text-xs text-muted">Il démarre vide : transférez-y du stock depuis la page Stock.</p>
        <button className="btn btn-primary self-end">Ajouter</button>
      </form>
    </>
  );
}
