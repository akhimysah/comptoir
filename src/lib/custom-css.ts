/**
 * CSS personnalisé d'une boutique, rendu inoffensif avant d'être placé dans une balise <style> :
 * aucun « < » (impossible de fermer la balise pour injecter du HTML ou un script), pas d'@import
 * (pas de feuille externe chargée à l'insu des clients), pas d'expression() ni de javascript:.
 */
export const CUSTOM_CSS_MAX = 20_000;

export function sanitizeCss(css: string) {
  return css
    .slice(0, CUSTOM_CSS_MAX)
    .replace(/</g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/behavior\s*:/gi, "")
    .replace(/-moz-binding/gi, "");
}
