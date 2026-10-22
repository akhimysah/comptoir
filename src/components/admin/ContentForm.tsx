"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { MetafieldInputs } from "./MetafieldInputs";
import { TemplateSelect } from "./TemplateSelect";
import type { MetafieldDef } from "@/lib/metafields";
import { saveContent, type ContentPayload } from "@/app/admin/content-actions";
import { RichText } from "@/components/store/RichText";
import { ImageField } from "./ImageField";
import { SaveBar } from "./SaveBar";
import { SeoCard } from "./SeoCard";

export function ContentForm({ initial, storeUrl, fieldDefs = [], templateOptions = [] }: { initial: ContentPayload; storeUrl: string; fieldDefs?: MetafieldDef[]; templateOptions?: string[] }) {
  const [state, action, pending] = useActionState(saveContent, undefined);
  const [c, setC] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [initialJson] = useState(() => JSON.stringify(initial));
  const router = useRouter();
  const set = (p: Partial<ContentPayload>) => setC((x) => ({ ...x, ...p }));
  const dirty = !initial.id || JSON.stringify(c) !== initialJson;
  const isPost = c.kind === "post";
  const path = isPost ? `/blog/${c.handle || "…"}` : `/pages/${c.handle || "…"}`;

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <input type="hidden" name="payload" value={JSON.stringify(c)} />
      <SaveBar visible={dirty} message={isPost ? "Article non enregistré" : "Page non enregistrée"} pending={pending} error={state?.error} onDiscard={() => (initial.id ? window.location.reload() : router.push(isPost ? "/admin/blog" : "/admin/pages"))} />
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <label className="label">Titre<input id="content-title" className="input" required maxLength={120} value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder={isPost ? "Comment entretenir vos céramiques" : "À propos"} /></label>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px]">Contenu</span>
              <div className="flex gap-1">
                <button type="button" className={`btn btn-sm ${!preview ? "bg-[#e3e3e3]" : ""}`} onClick={() => setPreview(false)}>Écrire</button>
                <button type="button" className={`btn btn-sm ${preview ? "bg-[#e3e3e3]" : ""}`} onClick={() => setPreview(true)}>Aperçu</button>
              </div>
            </div>
            {preview ? (
              <div className="min-h-[320px] rounded-lg border border-line p-4"><RichText text={c.body || "Rien à afficher pour l'instant."} /></div>
            ) : (
              <textarea id="content-body" className="input min-h-[320px] font-mono text-[13px] leading-6" value={c.body} onChange={(e) => set({ body: e.target.value })} />
            )}
            <p className="text-xs text-muted">Mise en forme : <code>## Titre</code>, <code>### Sous-titre</code>, <code>- élément de liste</code>, <code>**gras**</code>, <code>[texte du lien](https://…)</code>. Laissez une ligne vide entre deux paragraphes.</p>
          </div>
          {isPost && <label className="label">Extrait<span className="hint">Affiché dans la liste des articles.</span><textarea className="input min-h-[60px]" maxLength={400} value={c.excerpt} onChange={(e) => set({ excerpt: e.target.value })} /></label>}
        </section>
        {!isPost && <MetafieldInputs defs={fieldDefs} values={c.metafields ?? {}} onChange={(metafields) => set({ metafields })} />}
        <SeoCard title={c.seoTitle} description={c.seoDescription} fallbackTitle={c.title} fallbackDescription={c.excerpt || c.body.replace(/[#*\[\]()-]/g, "")} url={`${storeUrl}${path}`} onChange={(v) => set(v)} />
      </div>
      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Visibilité</h2>
          <label className="flex items-center gap-2"><input type="radio" checked={c.published} onChange={() => set({ published: true })} className="accent-[#7c3aed]" />Visible</label>
          <label className="flex items-center gap-2"><input type="radio" checked={!c.published} onChange={() => set({ published: false })} className="accent-[#7c3aed]" />Masqué (brouillon)</label>
          {!isPost && <label className="mt-1 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={c.showInFooter} onChange={(e) => set({ showInFooter: e.target.checked })} className="h-4 w-4 accent-[#7c3aed]" />Lien dans le pied de page</label>}
        </section>
        {!isPost && <TemplateSelect kind="page" options={templateOptions} value={c.templateSuffix ?? ""} onChange={(templateSuffix) => set({ templateSuffix })} />}
        {isPost && (
          <section className="card flex flex-col gap-3 p-4">
            <ImageField id="post-image" label="Image à la une" value={c.image ?? null} onChange={(image) => set({ image })} />
            <label className="label">Auteur<input className="input" maxLength={80} value={c.author} onChange={(e) => set({ author: e.target.value })} /></label>
          </section>
        )}
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Adresse</h2>
          <label className="label text-xs text-muted">Identifiant dans l'adresse<input className="input" maxLength={80} value={c.handle} placeholder="généré depuis le titre" onChange={(e) => set({ handle: e.target.value })} /></label>
        </section>
        <button className="btn btn-primary self-end" disabled={pending || !dirty}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </aside>
    </form>
  );
}
