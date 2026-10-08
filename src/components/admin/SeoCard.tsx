"use client";

/** Bloc « Référencement » avec l'aperçu du résultat dans Google, comme dans Shopify. */
export function SeoCard({ title, description, fallbackTitle, fallbackDescription, url, onChange }: {
  title: string; description: string; fallbackTitle: string; fallbackDescription: string; url: string;
  onChange: (v: { seoTitle?: string; seoDescription?: string }) => void;
}) {
  const shownTitle = (title || fallbackTitle || "Titre de la page").slice(0, 70);
  const shownDesc = (description || fallbackDescription || "Ajoutez une description pour donner envie de cliquer.").replace(/\s+/g, " ").slice(0, 160);
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Référencement sur les moteurs de recherche</h2>
      <div className="rounded-lg border border-line p-3">
        <div className="truncate text-xs text-[#202124]">{url}</div>
        <div className="truncate text-[17px] leading-6 text-[#1a0dab]">{shownTitle}</div>
        <div className="line-clamp-2 text-[13px] text-[#4d5156]">{shownDesc}</div>
      </div>
      <label className="label">Titre de la page<span className="hint">{(title || fallbackTitle).length} / 70 caractères</span>
        <input className="input" maxLength={70} value={title} placeholder={fallbackTitle} onChange={(e) => onChange({ seoTitle: e.target.value })} />
      </label>
      <label className="label">Méta-description<span className="hint">{description.length} / 160 caractères conseillés</span>
        <textarea className="input min-h-[70px]" maxLength={320} value={description} placeholder={fallbackDescription.slice(0, 160)} onChange={(e) => onChange({ seoDescription: e.target.value })} />
      </label>
    </section>
  );
}
