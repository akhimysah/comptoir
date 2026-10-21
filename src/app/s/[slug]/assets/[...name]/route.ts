import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rewriteShopifyCdn, themeFile } from "@/lib/liquid/source";
import { activeThemeRow } from "@/lib/liquid/active";

/** Fichiers assets/ du thème Shopify en vigueur (publié, ou brouillon en aperçu pour l'équipe). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; name: string[] }> }) {
  const { slug, name } = await params;
  const path = `assets/${name.map(decodeURIComponent).join("/")}`;
  if (path.includes("..")) return new NextResponse(null, { status: 400 });
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, publishedThemeId: true } });
  // ?t=<thème> : fichier d'un thème précis de la boutique (brouillon en aperçu) ; sinon le thème en vigueur.
  const t = new URL(req.url).searchParams.get("t");
  const theme = store && ((t && /^p_[A-Za-z0-9]{1,40}$/.test(t) ? await db.platformTheme.findFirst({ where: { id: t.slice(2), ready: true }, select: { id: true } }).then((r) => (r ? { id: `p_${r.id}`, version: 1 } : null)) : t && /^[A-Za-z0-9]{1,40}$/.test(t) ? await db.storeTheme.findFirst({ where: { id: t, storeId: store.id }, select: { id: true, version: true } }) : null) ?? (await activeThemeRow(store, req)));
  const file = theme && (await themeFile(theme.id, path));
  if (!file) return new NextResponse(null, { status: 404 });
  const body = file.text !== null ? (/\.(js|mjs|css)$/.test(path) ? rewriteShopifyCdn(file.text, theme, `/s/${slug}`) : file.text) : Buffer.from(file.bytes!);
  const versioned = new URL(req.url).searchParams.has("v");
  return new NextResponse(body, { headers: { "Content-Type": file.contentType || "application/octet-stream", "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
