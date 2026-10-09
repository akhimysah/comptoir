import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { subscribe } from "@/lib/marketing";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = z.string().trim().email().safeParse(body?.email);
  if (!email.success || typeof body?.slug !== "string") return NextResponse.json({ error: "Indiquez une adresse e-mail valide." }, { status: 400 });
  const store = await db.store.findUnique({ where: { slug: body.slug } });
  if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  await subscribe(store.id, email.data);
  return NextResponse.json({ ok: true });
}
