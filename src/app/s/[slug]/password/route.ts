import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";
import { passCookie, passValue, passwordMatches } from "@/lib/store-access";
import { appUrl } from "@/lib/stripe";

/** Saisie du mot de passe d'une boutique en préparation. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const home = `${appUrl()}/s/${slug}`;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, passwordEnabled: true, storePassword: true } });
  if (!store) return NextResponse.redirect(appUrl(), 303);
  if (!store.passwordEnabled) return NextResponse.redirect(home, 303);
  if (!(await hit(`store-pw:${store.id}:${await clientIp()}`, 10, 15 * 60_000))) return NextResponse.redirect(`${home}?pw=limit`, 303);
  const input = String((await req.formData()).get("password") ?? "");
  if (!passwordMatches(store, input)) return NextResponse.redirect(`${home}?pw=wrong`, 303);
  const res = NextResponse.redirect(home, 303);
  res.cookies.set(passCookie(store.id), passValue(store), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/s/${slug}`, maxAge: 30 * 86400 });
  return res;
}
