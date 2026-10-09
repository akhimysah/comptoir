import { NextResponse } from "next/server";
import { cookieName, storeCurrencies } from "@/lib/currency";
import { db } from "@/lib/db";

/** Choix de la devise d'affichage : /s/<boutique>/currency?c=USD (revient à la page précédente). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const store = await db.store.findUnique({ where: { slug } });
  const back = req.headers.get("referer");
  let target = `${url.origin}/s/${slug}`;
  try { if (back && new URL(back).origin === url.origin) target = back; } catch {}
  const res = NextResponse.redirect(target);
  const code = url.searchParams.get("c") ?? "";
  if (store && storeCurrencies(store).some((c) => c.code === code)) {
    res.cookies.set(cookieName(store.id), code, { path: `/s/${slug}`, maxAge: 365 * 86400, sameSite: "lax" });
  }
  return res;
}
