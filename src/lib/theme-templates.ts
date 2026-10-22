import "server-only";
import { db } from "./db";

export type TemplateKind = "product" | "collection" | "page";

/**
 * Gabarits alternatifs proposés par le thème publié (templates/product.<suffixe>.json…), comme le « Modèle de thème »
 * de Shopify. Un thème natif n'en a pas. Le suffixe déjà enregistré reste proposé même s'il a disparu du thème.
 */
export async function templateSuffixes(store: { publishedThemeId: string | null }, kind: TemplateKind, current = ""): Promise<string[]> {
  const out = new Set<string>();
  if (store.publishedThemeId) {
    const theme = await db.storeTheme.findUnique({ where: { id: store.publishedThemeId }, select: { engine: true } });
    if (theme?.engine === "liquid") {
      const files = await db.themeFile.findMany({ where: { themeId: store.publishedThemeId, path: { startsWith: `templates/${kind}.` } }, select: { path: true } });
      for (const f of files) { const m = f.path.match(/^templates\/[^.]+\.([^.]+)\.(json|liquid)$/); if (m) out.add(m[1]); }
    }
  }
  if (current) out.add(current);
  return [...out].sort();
}
