import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/traffic";

/**
 * Mesure d'audience de la vitrine (voir Analytics.tsx) : page vue au chargement, puis battement de cœur toutes
 * les 30 s pour la vue en direct. Aucune donnée personnelle : un identifiant de session aléatoire posé en cookie.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return new NextResponse(null, { status: 204 });
  if (!(await hit(`track:${store.id}:${await clientIp()}`, 240, 60_000))) return new NextResponse(null, { status: 204 });
  const b = (await req.json().catch(() => null)) as { type?: string; path?: string; referrer?: string; utm?: Record<string, string>; landing?: boolean; cartItems?: number; device?: string } | null;
  if (!b) return new NextResponse(null, { status: 204 });
  const cookie = req.headers.get("cookie") ?? "";
  let sessionId = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]{8,40})`))?.[1] ?? null;
  const res = new NextResponse(null, { status: 204 });
  // Page de destination : première page vue de la session (décidé ici, pas par le navigateur).
  let landing = !sessionId;
  if (!sessionId) {
    sessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    res.cookies.set(SESSION_COOKIE, sessionId, { path: "/", maxAge: 30 * 60, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  } else {
    res.cookies.set(SESSION_COOKIE, sessionId, { path: "/", maxAge: 30 * 60, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" }); // la session dure 30 min après la dernière activité
  }
  const path = String(b.path ?? "/").slice(0, 300);
  const clean = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");
  if (b.type === "view") {
    if (!landing) landing = !(await db.pageView.findFirst({ where: { storeId: store.id, sessionId }, select: { id: true } }));
    // Un référent externe seulement (les pages internes de la boutique ne comptent pas).
    const ref = clean(b.referrer, 500);
    let external = "";
    try { if (ref && new URL(ref).host !== new URL(req.url).host) external = ref; } catch {}
    await db.pageView.create({ data: { storeId: store.id, sessionId, path, referrer: external, utmSource: clean(b.utm?.utm_source, 80), utmMedium: clean(b.utm?.utm_medium, 80), utmCampaign: clean(b.utm?.utm_campaign, 120), landing, device: ["mobile", "tablet", "desktop"].includes(String(b.device)) ? String(b.device) : "" } });
  }
  const cartItems = Math.max(0, Math.min(999, Math.floor(Number(b.cartItems) || 0)));
  await db.liveVisitor.upsert({ where: { sessionId }, update: { path, cartItems, lastSeenAt: new Date() }, create: { sessionId, storeId: store.id, path, cartItems } });
  return res;
}
