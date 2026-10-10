import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLocale } from "@/lib/locale";
import { suggest } from "@/lib/search";
import { storeAccess } from "@/lib/store-access";

/** Recherche prédictive : /s/<boutique>/search/suggest?q=… (dans la langue du visiteur). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const store = await db.store.findUnique({ where: { slug: (await params).slug } });
  if (!store || !(await storeAccess(store)).allowed) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  const res = await suggest(store.id, q, await getLocale(store));
  return NextResponse.json(res, { headers: { "Cache-Control": "private, max-age=30" } });
}
