import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suggest } from "@/lib/search";
import { storeAccess } from "@/lib/store-access";

/** Recherche prédictive : /s/<boutique>/search/suggest?q=… */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const store = await db.store.findUnique({ where: { slug: (await params).slug } });
  if (!store || !(await storeAccess(store)).allowed) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  return NextResponse.json(await suggest(store.id, q), { headers: { "Cache-Control": "private, max-age=30" } });
}
