"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewTemplate, saveTemplate } from "@/app/admin/settings/notifications/template-actions";
import type { TemplateText } from "@/lib/email-templates";

export function TemplateEditor({ templateKey, initial, defaults, vars }: { templateKey: string; initial: TemplateText; defaults: TemplateText; vars: string[] }) {
  const [t, setT] = useState(initial);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const last = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Aperçu recalculé 300 ms après la dernière frappe.
  useEffect(() => {
    const id = setTimeout(() => { previewTemplate(templateKey, t).then(setPreview).catch(() => {}); }, 300);
    return () => clearTimeout(id);
  }, [t, templateKey]);

  const insert = (v: string) => {
    const el = last.current;
    const field = (el?.name as keyof TemplateText) || "intro";
    const tag = `{{${v}}}`;
    const cur = t[field];
    const pos = el && el.selectionStart !== null ? el.selectionStart : cur.length;
    setT({ ...t, [field]: cur.slice(0, pos) + tag + cur.slice(pos) });
  };
  const save = (reset = false) => start(async () => {
    const res = await saveTemplate(templateKey, reset ? null : t);
    if (reset) setT(defaults);
    setMsg(res.error ?? (reset ? "Texte d'origine rétabli." : "E-mail enregistré."));
  });
  const field = "input";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <section className="card flex flex-col gap-3 p-4">
        <label className="label">Objet<input name="subject" value={t.subject} onFocus={(e) => (last.current = e.currentTarget)} onChange={(e) => setT({ ...t, subject: e.target.value })} maxLength={150} className={field} /></label>
        <label className="label">Titre<input name="title" value={t.title} onFocus={(e) => (last.current = e.currentTarget)} onChange={(e) => setT({ ...t, title: e.target.value })} maxLength={150} className={field} /></label>
        <label className="label">Message <span className="hint">Une ligne vide sépare deux paragraphes. Les articles, montants et boutons sont ajoutés automatiquement.</span>
          <textarea name="intro" value={t.intro} onFocus={(e) => (last.current = e.currentTarget)} onChange={(e) => setT({ ...t, intro: e.target.value })} rows={6} maxLength={2000} className={field} />
        </label>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Insérer :</span>
          {vars.map((v) => <button key={v} type="button" onClick={() => insert(v)} className="rounded-md bg-[#f3f0ff] px-2 py-0.5 font-mono text-[#5b21b6] hover:bg-[#ede9fe]">{`{{${v}}}`}</button>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => save(true)} disabled={pending} className="text-[13px] text-muted hover:underline">Rétablir le texte d'origine</button>
          <span className="flex items-center gap-3">
            {msg && <span role="status" className="text-[13px] text-[#0c5132]">{msg}</span>}
            <button type="button" onClick={() => save()} disabled={pending} className="btn btn-primary">{pending ? "Enregistrement…" : "Enregistrer"}</button>
          </span>
        </div>
      </section>
      <section className="card overflow-hidden">
        <div className="card-h flex-col items-start gap-0.5"><h2 className="text-sm font-[650]">Aperçu</h2><p className="truncate text-xs text-muted">Objet : {preview?.subject ?? "…"}</p></div>
        {preview ? <iframe title="Aperçu de l'e-mail" srcDoc={preview.html} sandbox="" className="h-[560px] w-full bg-[#f1f1f1]" /> : <p className="p-6 text-muted">Chargement…</p>}
      </section>
    </div>
  );
}
