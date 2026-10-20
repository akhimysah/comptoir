import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";

/** Mesures de performance envoyées par le navigateur à la fin de la visite d'une page (voir Vitals.tsx). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return new NextResponse(null, { status: 204 });
  if (!(await hit(`vitals:${store.id}:${await clientIp()}`, 60, 60_000))) return new NextResponse(null, { status: 204 });
  const b = (await req.json().catch(() => null)) as { lcp?: unknown; inp?: unknown; cls?: unknown } | null;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const lcp = num(b?.lcp, 60_000), inp = num(b?.inp, 60_000), cls = num(b?.cls, 10);
  if (lcp === null && inp === null && cls === null) return new NextResponse(null, { status: 204 });
  await db.webVital.create({ data: { storeId: store.id, lcp: lcp === null ? null : Math.round(lcp), inp: inp === null ? null : Math.round(inp), cls: cls === null ? null : Math.round(cls * 1000) / 1000 } });
  return new NextResponse(null, { status: 204 });
}
