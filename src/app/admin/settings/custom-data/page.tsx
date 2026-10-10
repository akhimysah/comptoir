import { createDefinition, deleteDefinition, updateDefinition } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { choicesOf, METAFIELD_TYPES, type MetafieldType } from "@/lib/metafields";

export default async function CustomDataPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { store } = await requireOwner();
  const defs = await db.metafieldDefinition.findMany({ where: { storeId: store.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const filled = await db.product.findMany({ where: { storeId: store.id, NOT: { metafields: "{}" } }, select: { metafields: true } });
  const usage = (key: string) => filled.filter((p) => { try { return JSON.parse(p.metafields)[key] !== undefined; } catch { return false; } }).length;
  return (
    <>
      <PageHeader back="/admin/settings" title="Données personnalisées" subtitle="Ajoutez vos propres champs aux produits : matière, dimensions, entretien… Ils s'affichent sur la fiche produit et peuvent servir de filtres." />
      {ok && <p role="status" className="card mb-4 bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">{ok}</p>}
      {err && <p role="alert" className="card mb-4 bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Champs des produits</h2><span className="text-xs text-muted">{defs.length} champ{defs.length > 1 ? "s" : ""}</span></div>
          {defs.length ? (
            <ul>
              {defs.map((d) => (
                <li key={d.id} className="border-b border-line last:border-0">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 hover:bg-[#f7f7f7]">
                      <span className="font-[550]">{d.name}</span>
                      <Pill dot={false}>{METAFIELD_TYPES[d.type as MetafieldType] ?? d.type}{d.unit ? ` · ${d.unit}` : ""}</Pill>
                      {d.filterable && <Pill tone="info" dot={false}>Filtre</Pill>}
                      {!d.showOnProduct && <Pill dot={false}>Masqué sur la fiche</Pill>}
                      <span className="ml-auto text-xs text-muted">{usage(d.key)} produit{usage(d.key) > 1 ? "s" : ""} renseigné{usage(d.key) > 1 ? "s" : ""}</span>
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-line bg-[#fafafa] px-4 py-3">
                      <form action={updateDefinition} className="flex flex-col gap-3">
                        <input type="hidden" name="id" value={d.id} />
                        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                          <label className="label">Nom<input name="name" defaultValue={d.name} maxLength={40} className="input" /></label>
                          <label className="label">Unité<input name="unit" defaultValue={d.unit} maxLength={10} placeholder="cm" className="input" disabled={d.type === "boolean" || d.type === "choice"} /></label>
                        </div>
                        {d.type === "choice" && <label className="label">Choix (un par ligne)<textarea name="choices" rows={4} defaultValue={choicesOf(d).join("\n")} className="input" /></label>}
                        <div className="flex flex-wrap gap-4 text-[13px]">
                          <label className="flex items-center gap-2"><input type="checkbox" name="showOnProduct" defaultChecked={d.showOnProduct} className="h-4 w-4 accent-[#7c3aed]" />Afficher sur la fiche produit</label>
                          {["choice", "boolean", "text"].includes(d.type) && <label className="flex items-center gap-2"><input type="checkbox" name="filterable" defaultChecked={d.filterable} className="h-4 w-4 accent-[#7c3aed]" />Proposer comme filtre</label>}
                        </div>
                        <button className="btn btn-primary self-start">Enregistrer</button>
                      </form>
                      <form action={deleteDefinition} className="self-start">
                        <input type="hidden" name="id" value={d.id} />
                        <ConfirmSubmit label="Supprimer ce champ" confirmLabel="Supprimer aussi les valeurs saisies" className="btn-sm" />
                      </form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-muted">Aucun champ pour le moment. Créez par exemple « Matière » (liste de choix) ou « Dimensions » (texte court).</p>
          )}
        </section>
        <form action={createDefinition} className="card flex flex-col gap-3 self-start p-4">
          <h2 className="text-sm font-[650]">Nouveau champ</h2>
          <label className="label">Nom<input name="name" required maxLength={40} placeholder="Matière" className="input" /></label>
          <label className="label">Type
            <select name="type" defaultValue="text" className="input">
              {(Object.keys(METAFIELD_TYPES) as MetafieldType[]).map((t) => <option key={t} value={t}>{METAFIELD_TYPES[t]}</option>)}
            </select>
          </label>
          <label className="label">Choix <span className="hint">Pour une liste de choix : un par ligne.</span><textarea name="choices" rows={3} placeholder={"Grès\nPorcelaine\nFaïence"} className="input" /></label>
          <label className="label">Unité <span className="hint">Facultatif, pour un nombre ou un texte court.</span><input name="unit" maxLength={10} placeholder="cm" className="input" /></label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="filterable" className="h-4 w-4 accent-[#7c3aed]" />Proposer comme filtre sur la boutique</label>
          <button className="btn btn-primary">Créer le champ</button>
        </form>
      </div>
    </>
  );
}
