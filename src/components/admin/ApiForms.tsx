"use client";

import { useActionState } from "react";
import { createApiKey, createWebhook } from "@/app/admin/settings/api/actions";
import { keepOnSubmit } from "@/lib/keep-form";
import { CopyField } from "./CopyField";

export function ApiKeyForm({ scopes }: { scopes: Record<string, string> }) {
  const [state, action, pending] = useActionState(createApiKey, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-3 p-4">
      <label className="label">Nom<input name="name" required maxLength={60} className="input" placeholder="Logiciel de caisse" /></label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px]">Droits</legend>
        {Object.entries(scopes).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="scopes" value={k} className="h-4 w-4 accent-[#7c3aed]" />{label} <code className="text-xs text-muted">{k}</code></label>
        ))}
      </fieldset>
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state?.key && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-[#b4fed2] bg-[#ecfdf3] p-3">
          <p className="text-[13px] font-[650] text-[#0c5132]">Clé créée. Copiez-la maintenant : elle ne sera plus jamais affichée.</p>
          <CopyField value={state.key} label="Clé d'API" />
        </div>
      )}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Création…" : "Créer la clé"}</button>
    </form>
  );
}

export function WebhookForm({ topics }: { topics: Record<string, string> }) {
  const [state, action, pending] = useActionState(createWebhook, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-3 p-4">
      <label className="label">Adresse à appeler<input name="url" type="url" required maxLength={500} className="input" placeholder="https://mon-logiciel.fr/webhooks/revolution" /></label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px]">Événements</legend>
        {Object.entries(topics).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="topics" value={k} className="h-4 w-4 accent-[#7c3aed]" />{label} <code className="text-xs text-muted">{k}</code></label>
        ))}
      </fieldset>
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] font-[550] text-[#0c5132]">Webhook ajouté.</p>}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Ajout…" : "Ajouter le webhook"}</button>
    </form>
  );
}
