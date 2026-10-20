"use client";

import { useActionState } from "react";
import { saveCustomCss } from "@/app/admin/theme/actions";
import { CUSTOM_CSS_MAX } from "@/lib/custom-css";
import { keepOnSubmit } from "@/lib/keep-form";

export function CustomCssForm({ css, slug, themeId }: { css: string; slug: string; themeId: string }) {
  const [state, action, pending] = useActionState(saveCustomCss, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="card mt-4 flex flex-col gap-3 p-4">
      <input type="hidden" name="themeId" value={themeId} />
      <div>
        <h2 className="text-sm font-[650]">CSS personnalisé</h2>
        <p className="text-xs text-muted">Pour aller plus loin que les réglages : s'applique à toutes les pages de la boutique. Variables disponibles : <code>--c-accent</code>, <code>--c-bg</code>, <code>--c-text</code>, <code>--c-muted</code>, <code>--c-surface</code>, <code>--t-radius</code>.</p>
      </div>
      <textarea name="css" defaultValue={css} maxLength={CUSTOM_CSS_MAX} rows={10} spellCheck={false} placeholder={"/* Exemple : boutons tout ronds et titres en majuscules */\nbutton, a[class*=\"rounded\"] { border-radius: 999px; }\nh1, h2 { text-transform: uppercase; letter-spacing: .04em; }"} className="input font-mono text-[12px] leading-relaxed" aria-label="CSS personnalisé" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">Pour des raisons de sécurité, le HTML, les scripts et @import sont retirés.</span>
        <span className="flex items-center gap-3">
          {state?.error && <span role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</span>}
          {state?.ok && <span role="status" className="text-[13px] text-[#0c5132]">Enregistré. <a href={`/s/${slug}`} target="_blank" className="underline">Voir la boutique</a></span>}
          <button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le CSS"}</button>
        </span>
      </div>
    </form>
  );
}
