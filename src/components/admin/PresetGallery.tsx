import { addPresetTheme } from "@/app/admin/theme/actions";
import { PRESETS } from "@/lib/theme";

const DESCRIPTIONS: Record<string, string> = {
  argile: "Chaleureux et artisanal : céramique, décoration, épicerie fine.",
  minuit: "Sombre et élégant : mode, bijoux, high-tech.",
  menthe: "Frais et arrondi : cosmétiques, bien-être, enfants.",
  papier: "Minimal, noir et blanc : galerie, design, édition.",
};

/** Mini-maquette d'un modèle, dessinée en CSS avec ses couleurs. */
function Mock({ k }: { k: keyof typeof PRESETS }) {
  const p = PRESETS[k];
  const r = p.radius === "none" ? "0" : p.radius === "small" ? "4px" : "10px";
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-t-xl" style={{ background: p.colors.background, color: p.colors.text }} aria-hidden>
      <div className="flex items-center justify-between px-4 py-2 text-[9px] font-semibold" style={{ borderBottom: `1px solid ${p.colors.muted}33` }}><span>maboutique</span><span className="flex gap-2 opacity-60"><span>Boutique</span><span>Blog</span></span></div>
      <div className="mx-4 mt-3 flex h-20 flex-col justify-center gap-1.5 px-4" style={{ background: p.colors.surface, borderRadius: r }}>
        <span className="h-2.5 w-24 rounded-sm" style={{ background: p.colors.text }} /><span className="h-1.5 w-32 rounded-sm" style={{ background: p.colors.muted }} />
        <span className="mt-1 h-4 w-14" style={{ background: p.colors.accent, borderRadius: r }} />
      </div>
      <div className="mx-4 mt-3 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-1"><div className="aspect-[4/5]" style={{ background: p.colors.surface, borderRadius: r, border: `1px solid ${p.colors.muted}33` }} /><span className="h-1 w-3/4 rounded-sm" style={{ background: p.colors.text }} /><span className="h-1 w-1/3 rounded-sm" style={{ background: p.colors.muted }} /></div>)}</div>
    </div>
  );
}

/** « Découvrir des thèmes » : modèles prêts à l'emploi ajoutés aux brouillons en un clic. */
export function PresetGallery() {
  return (
    <section className="card p-4">
      <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-base font-[650]">Découvrir des thèmes</h2><span className="text-xs text-muted">Chaque modèle s'ajoute à vos brouillons, à personnaliser dans l'éditeur.</span></div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
          <div key={k} className="flex flex-col rounded-xl border border-line">
            <Mock k={k} />
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0"><div className="font-[650]">{PRESETS[k].label}</div><div className="truncate text-xs text-muted" title={DESCRIPTIONS[k]}>{DESCRIPTIONS[k] ?? "par Revolution Ecom"}</div></div>
              <form action={addPresetTheme}><input type="hidden" name="preset" value={k} /><button className="btn">Ajouter</button></form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
