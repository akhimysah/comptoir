"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importProducts } from "@/app/admin/products/import/actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importProducts, undefined);
  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-1.5 border border-[#ddd6fe] bg-[#faf8ff] p-4">
        <h2 className="text-sm font-[650]">Vous venez de Shopify ?</h2>
        <p className="text-[13px] text-muted">Dans votre admin Shopify : <b>Produits → Exporter → Tous les produits → CSV pour Excel, Numbers…</b> Importez ce fichier ici tel quel : produits, variantes, prix, stock, statut, type (devient une collection) et photos sont repris.</p>
      </section>
      <form action={action} className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-[650]">Fichier CSV</h2>
        <input id="import-file" name="file" type="file" accept=".csv,text/csv" required className="text-[13px] file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-[#e3e3e3] file:px-3 file:font-[550]" />
        <p className="text-xs text-muted">
          Colonnes : {"Identifiant, Titre, Description, Statut (actif / brouillon), Collections, Option1 nom, Option1 valeur… Prix, Prix avant réduction, SKU, Stock"}.
          Le plus simple : <a href="/admin/products/export" className="text-pine hover:underline">exportez vos produits</a>, modifiez le fichier dans Excel, puis réimportez-le. Un produit existant (même identifiant) est mis à jour.
        </p>
        <button className="btn btn-primary self-start" disabled={pending}>{pending ? "Import en cours (les photos peuvent prendre une minute)…" : "Importer les produits"}</button>
      </form>
      {state && "error" in state && <p role="alert" className="card bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state && "created" in state && (
        <section className="card flex flex-col gap-2 p-4" role="status">
          <h2 className="text-sm font-[650]">Import terminé</h2>
          <p>{state.shopify && "Export Shopify reconnu. "}{state.created} produit{state.created > 1 ? "s" : ""} créé{state.created > 1 ? "s" : ""}, {state.updated} mis à jour{state.images ? `, ${state.images} photo${state.images > 1 ? "s" : ""} récupérée${state.images > 1 ? "s" : ""}` : ""}.</p>
          {state.errors.length > 0 && (
            <ul className="list-disc pl-5 text-[13px] text-[#8e0b21]">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <Link href="/admin/products" className="btn self-start">Voir les produits</Link>
        </section>
      )}
    </div>
  );
}
