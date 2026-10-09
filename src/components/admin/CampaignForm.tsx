"use client";

import { useActionState, useState } from "react";
import { saveCampaign, type CampaignPayload } from "@/app/admin/marketing/actions";
import { Thumb } from "@/components/ui";

type P = { id: string; title: string; image: string | null; hue: number };

export function CampaignForm({ initial, products, readOnly, audiences }: { initial: CampaignPayload; products: P[]; readOnly: boolean; audiences: { id: string | null; label: string; count: number }[] }) {
  const [state, action, pending] = useActionState(saveCampaign, undefined);
  const [c, setC] = useState(initial);
  const [q, setQ] = useState("");
  const set = (p: Partial<CampaignPayload>) => setC((x) => ({ ...x, ...p }));
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <input type="hidden" name="payload" value={JSON.stringify(c)} />
      <fieldset disabled={readOnly} className="flex flex-col gap-3">
        <label className="label">Destinataires<span className="hint">Seuls les clients abonnés à la newsletter reçoivent les campagnes.</span>
          <select className="input" value={c.segmentId ?? ""} onChange={(e) => set({ segmentId: e.target.value || null })}>
            {audiences.map((a) => <option key={a.id ?? "all"} value={a.id ?? ""}>{a.label} ({a.count} abonné{a.count > 1 ? "s" : ""})</option>)}
          </select>
        </label>
        <label className="label">Objet de l'e-mail<input className="input" required maxLength={150} value={c.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Notre nouvelle collection est arrivée" /></label>
        <label className="label">Titre<input className="input" maxLength={150} value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder="Des couleurs d'automne" /></label>
        <label className="label">Message<textarea className="input min-h-[180px] font-mono text-[13px] leading-6" value={c.body} onChange={(e) => set({ body: e.target.value })} placeholder={"Bonjour,\n\nNos nouvelles pièces sortent du four…"} /></label>
        <p className="text-xs text-muted">Mise en forme : <code>## Titre</code>, <code>- liste</code>, <code>**gras**</code>, <code>[lien](https://…)</code>.</p>
        <div className="flex flex-col gap-2">
          <span className="text-[13px]">Produits mis en avant <span className="text-muted">({c.productIds.length}/6)</span></span>
          <div className="flex flex-wrap gap-2">
            {c.productIds.map((id) => { const p = products.find((x) => x.id === id); return p ? (
              <span key={id} className="inline-flex items-center gap-2 rounded-lg border border-line py-1 pl-1 pr-2 text-[13px]"><Thumb image={p.image} hue={p.hue} title={p.title} className="h-7 w-7 text-[9px]" />{p.title}<button type="button" aria-label={`Retirer ${p.title}`} onClick={() => set({ productIds: c.productIds.filter((x) => x !== id) })}>✕</button></span>
            ) : null; })}
          </div>
          {c.productIds.length < 6 && (
            <div className="relative">
              <input className="input" placeholder="Ajouter un produit" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ajouter un produit à la campagne" />
              {q.trim() && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
                  {products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()) && !c.productIds.includes(p.id)).slice(0, 8).map((p) => (
                    <li key={p.id}><button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f1f1]" onClick={() => { set({ productIds: [...c.productIds, p.id] }); setQ(""); }}><Thumb image={p.image} hue={p.hue} title={p.title} className="h-7 w-7 text-[9px]" />{p.title}</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <label className="label">Texte du bouton<input className="input w-60" maxLength={40} value={c.buttonText} onChange={(e) => set({ buttonText: e.target.value })} /></label>
      </fieldset>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Brouillon enregistré. L'aperçu est à jour.</p>}
      {!readOnly && <button className="btn btn-primary self-start" disabled={pending}>{pending ? "Enregistrement…" : initial.id ? "Enregistrer le brouillon" : "Créer le brouillon"}</button>}
    </form>
  );
}
