import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { langCookie, storeLocales } from "@/lib/locale";

/** Choix de la langue : /s/<boutique>/lang?l=en (revient à la page précédente). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const store = await db.store.findUnique({ where: { slug } });
  const back = req.headers.get("referer");
  let target = `${url.origin}/s/${slug}`;
  try { if (back && new URL(back).origin === url.origin) target = back; } catch {}
  const res = NextResponse.redirect(target);
  const l = url.searchParams.get("l") ?? "";
  if (store && (storeLocales(store) as string[]).includes(l)) res.cookies.set(langCookie(store.id), l, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  return res;
}
