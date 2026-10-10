"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importCustomersAction } from "@/app/admin/customers/import/actions";

export function CustomerImportForm() {
  const [state, action, pending] = useActionState(importCustomersAction, undefined);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section className="card flex flex-col gap-1.5 border border-[#ddd6fe] bg-[#faf8ff] p-4">
        <h2 className="text-sm font-[650]">Vous venez de Shopify ?</h2>
        <p className="text-[13px] text-muted">Dans votre admin Shopify : <b>Clients → Exporter → Tous les clients → CSV pour Excel, Numbers…</b> Importez ce fichier ici tel quel : nom, e-mail, consentement newsletter, étiquettes, note, téléphone et adresse sont repris.</p>
      </section>
      <form action={action} className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-[650]">Fichier CSV</h2>
        <input id="customer-import-file" name="file" type="file" accept=".csv,text/csv" required className="text-[13px] file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-[#e3e3e3] file:px-3 file:font-[550]" />
        <p className="text-xs text-muted">
          Ou notre format : Nom, E-mail, Abonné newsletter (oui / non), Étiquettes, Note, Téléphone, Adresse, Code postal, Ville, Pays.
          Le plus simple : <a href="/admin/customers/export" className="text-pine hover:underline">exportez vos clients</a> pour avoir le modèle. Un client existant (même e-mail) est mis à jour.
        </p>
        <p className="text-xs text-muted">Newsletter : seuls les clients qui l'avaient acceptée deviennent abonnés, et un client qui s'est désabonné ici le reste.</p>
        <button className="btn btn-primary self-start" disabled={pending}>{pending ? "Import en cours…" : "Importer les clients"}</button>
      </form>
      {state && "error" in state && <p role="alert" className="card bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state && "created" in state && (
        <section className="card flex flex-col gap-2 p-4" role="status">
          <h2 className="text-sm font-[650]">Import terminé</h2>
          <p>{state.shopify && "Export Shopify reconnu. "}{state.created} client{state.created > 1 ? "s" : ""} créé{state.created > 1 ? "s" : ""}, {state.updated} mis à jour, {state.subscribed} abonné{state.subscribed > 1 ? "s" : ""} à la newsletter.</p>
          {state.errors.length > 0 && <ul className="list-disc pl-5 text-[13px] text-[#8e0b21]">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Link href="/admin/customers" className="btn self-start">Voir les clients</Link>
        </section>
      )}
    </div>
  );
}
