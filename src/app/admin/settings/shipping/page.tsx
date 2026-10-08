import { addRate, deleteRate, deleteZone } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ZoneForm } from "@/components/admin/ZoneForm";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export default async function ShippingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const { store } = await requireOwner();
  const zones = await db.shippingZone.findMany({ where: { storeId: store.id }, include: { rates: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } });
  const m = (c: number) => formatMoney(c, store.currency);

  return (
    <>
      <PageHeader back="/admin/settings" title="Expédition et livraison" subtitle="Les pays où vous livrez et les tarifs proposés au client dans le panier." />
      {!zones.length && (
        <p className="card bg-[#f7f7f7] px-4 py-3 text-[13px]">
          Aucune zone pour l'instant : un tarif unique de {m(store.shippingCents)} s'applique partout{store.freeShippingFromCents ? `, offert dès ${m(store.freeShippingFromCents)}` : ""} (réglable dans Paramètres). Créez des zones pour choisir les pays livrés et proposer plusieurs tarifs.
        </p>
      )}
      {zones.map((z) => {
        const countries = parseJson<string[]>(z.countries, []);
        return (
          <section key={z.id} className="card overflow-hidden">
            <div className="card-h">
              <div className="min-w-0">
                <h2 className="text-sm font-[650]">{z.name}</h2>
                <p className="truncate text-xs text-muted">{countries.join(", ")}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={edit === z.id ? "/admin/settings/shipping" : `/admin/settings/shipping?edit=${z.id}`} className="btn btn-sm">{edit === z.id ? "Fermer" : "Modifier"}</a>
                <form action={deleteZone}><input type="hidden" name="id" value={z.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" className="btn-sm" /></form>
              </div>
            </div>
            {edit === z.id && <div className="border-b border-line p-4"><ZoneForm zone={{ id: z.id, name: z.name, countries }} /></div>}
            <table className="w-full">
              <thead><tr><th className="th">Tarif</th><th className="th">Condition</th><th className="th text-right">Prix</th><th className="th" /></tr></thead>
              <tbody>
                {z.rates.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-[550]">{r.name}</td>
                    <td className="td text-muted">{r.freeAboveCents ? `Gratuit dès ${m(r.freeAboveCents)}` : "—"}</td>
                    <td className="td num text-right">{r.priceCents ? m(r.priceCents) : "Gratuit"}</td>
                    <td className="td w-24 text-right"><form action={deleteRate}><input type="hidden" name="id" value={r.id} /><button className="btn btn-sm">Retirer</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form action={addRate} className="flex flex-wrap items-end gap-2 border-t border-line bg-[#f7f7f7] px-4 py-3">
              <input type="hidden" name="zoneId" value={z.id} />
              <label className="label text-xs">Nom du tarif<input name="name" required maxLength={60} placeholder="Express" className="input h-8 w-36" /></label>
              <label className="label text-xs">Prix<input name="price" required inputMode="decimal" placeholder="9,90" className="input num h-8 w-24" /></label>
              <label className="label text-xs">Gratuit dès (optionnel)<input name="freeAbove" inputMode="decimal" placeholder="100,00" className="input num h-8 w-28" /></label>
              <button className="btn">Ajouter un tarif</button>
            </form>
          </section>
        );
      })}
      <section className="card flex flex-col gap-3 p-4">
        <ZoneForm />
      </section>
    </>
  );
}
