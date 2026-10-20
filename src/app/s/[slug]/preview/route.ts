import { NextResponse } from "next/server";
import { accessibleStores, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { previewCookie } from "@/lib/storefront";

/** Aperçu d'un brouillon de thème par l'équipe : /s/<boutique>/preview?theme=<id> ; ?exit=1 pour le quitter. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  const home = new URL(`/s/${slug}`, url.origin);
  if (!store) return NextResponse.redirect(home, 303);
  const res = NextResponse.redirect(home, 303);
  const themeId = url.searchParams.get("theme");
  const user = await getUser();
  const staff = user && (await accessibleStores(user.id)).some((s) => s.id === store.id);
  if (url.searchParams.get("exit") || !themeId || !staff || !(await db.storeTheme.findFirst({ where: { id: themeId, storeId: store.id }, select: { id: true } }))) {
    res.cookies.set(previewCookie(store.id), "", { path: "/", maxAge: 0 });
    return res;
  }
  res.cookies.set(previewCookie(store.id), themeId, { path: "/", maxAge: 3600, sameSite: "lax", httpOnly: true });
  return res;
}
