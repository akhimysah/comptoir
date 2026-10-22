"use client";

/** « Modèle de thème » : gabarit alternatif du thème publié pour cet élément (product.<suffixe>…), comme sur Shopify. */
export function TemplateSelect({ kind, options, value, onChange }: { kind: "product" | "collection" | "page"; options: string[]; value: string; onChange: (v: string) => void }) {
  if (!options.length && !value) return null;
  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-[650]">Modèle de thème</h2>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input" aria-label="Modèle de thème">
        <option value="">{kind === "product" ? "Produit par défaut" : kind === "collection" ? "Collection par défaut" : "Page par défaut"}</option>
        {options.map((o) => <option key={o} value={o}>{kind}.{o}</option>)}
      </select>
      <p className="text-xs text-muted">Les gabarits viennent de votre thème publié (fichiers templates/{kind}.*.json). Changer de thème peut en retirer.</p>
    </section>
  );
}
