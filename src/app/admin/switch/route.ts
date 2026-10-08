import { NextResponse } from "next/server";
import { accessibleStores, requireUser, STORE_COOKIE } from "@/lib/auth";

/** Change de boutique active puis redirige : /admin/switch?store=ID&to=/admin/orders/… */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const id = url.searchParams.get("store") ?? "";
  const to = url.searchParams.get("to") ?? "/admin";
  const stores = await accessibleStores(user.id);
  const target = to.startsWith("/admin") ? to : "/admin";
  const res = NextResponse.redirect(new URL(target, url));
  if (stores.some((s) => s.id === id)) res.cookies.set(STORE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400, secure: process.env.NODE_ENV === "production" });
  return res;
}
