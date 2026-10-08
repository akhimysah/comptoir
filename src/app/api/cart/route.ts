import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceCart } from "@/lib/pricing";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.slug !== "string" || !Array.isArray(body.items)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const store = await db.store.findUnique({ where: { slug: body.slug } });
  if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  return NextResponse.json(await priceCart(store, body.items.slice(0, 100), typeof body.code === "string" ? body.code : null));
}
