import "server-only";
import { accessibleStores, getUser } from "../auth";
import { db } from "../db";
import { previewCookie } from "../storefront";

type StoreRef = { id: string; publishedThemeId: string | null };

/**
 * Thème en vigueur pour cette requête : le brouillon en aperçu (cookie pt_<boutique> ou ?pt=, équipe seulement),
 * sinon le thème publié. Renvoie la ligne StoreTheme (sans ses fichiers) ou null.
 */
export async function activeThemeRow(store: StoreRef, req: Request) {
  const url = new URL(req.url);
  const cookie = req.headers.get("cookie") ?? "";
  const fromParam = url.searchParams.get("pt") ?? req.headers.get("x-preview-theme");
  const fromCookie = cookie.match(new RegExp(`(?:^|;\\s*)${previewCookie(store.id)}=([A-Za-z0-9]+)`))?.[1];
  const previewId = fromParam && /^[A-Za-z0-9]{1,40}$/.test(fromParam) ? fromParam : fromCookie;
  if (previewId) {
    const user = await getUser();
    if (user && (await accessibleStores(user.id)).some((s) => s.id === store.id)) {
      const row = await db.storeTheme.findFirst({ where: { id: previewId, storeId: store.id } });
      if (row) return { ...row, preview: true };
    }
  }
  if (!store.publishedThemeId) return null;
  const row = await db.storeTheme.findUnique({ where: { id: store.publishedThemeId } });
  return row ? { ...row, preview: false } : null;
}
