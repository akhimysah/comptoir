import { NextResponse } from "next/server";
import { cookieName as currencyCookie, storeCurrencies } from "@/lib/currency";
import { db } from "@/lib/db";
import { langCookie, storeLocales } from "@/lib/locale";
import { marketCookie, marketLocale } from "@/lib/markets";

/** Choix du pays / marché : /s/<boutique>/market?m=<id> (« default » = réglages de la boutique). Revient à la page précédente. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const store = await db.store.findUnique({ where: { slug } });
  const back = req.headers.get("referer");
  let target = `${url.origin}/s/${slug}`;
  try { if (back && new URL(back).origin === url.origin) target = back; } catch {}
  const res = NextResponse.redirect(target);
  if (!store) return res;
  const id = url.searchParams.get("m") ?? "";
  const cookie = (name: string, value: string | null) => (value ? res.cookies.set(name, value, { path: "/", maxAge: 365 * 86400, sameSite: "lax" }) : res.cookies.set(name, "", { path: "/", maxAge: 0 }));
  const market = id && id !== "default" ? await db.market.findFirst({ where: { id, storeId: store.id, enabled: true } }) : null;
  cookie(marketCookie(store.id), market?.id ?? null);
  // Le marché entraîne sa devise et sa langue (le visiteur peut ensuite les changer séparément).
  const currency = market?.currency && storeCurrencies(store).some((c) => c.code === market.currency) ? market.currency : null;
  cookie(currencyCookie(store.id), currency);
  const locale = marketLocale(market);
  cookie(langCookie(store.id), locale && (storeLocales(store) as string[]).includes(locale) ? locale : null);
  return res;
}
