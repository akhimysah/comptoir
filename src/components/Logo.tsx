/* eslint-disable @next/next/no-img-element */

/**
 * Logo Revolution Agency. Avec le nom : logo complet (texte blanc sur fond sombre, « light » ;
 * texte foncé sur fond clair, « dark »). Sans le nom : le symbole seul.
 */
export function Logo({ size = 32, withName = true, tone = "dark", className = "" }: { size?: number; withName?: boolean; tone?: "light" | "dark"; className?: string; nameClassName?: string }) {
  if (!withName) return <img src="/brand/revolution-mark.svg" alt="Revolution Agency" width={size} height={size} className={`shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />;
  // Le logo complet est 5,3 fois plus large que haut.
  return <img src={`/brand/revolution-agency-${tone}.png`} alt="Revolution Agency" height={size} width={Math.round(size * 5.32)} className={`shrink-0 ${className}`} style={{ height: size, width: "auto" }} />;
}
