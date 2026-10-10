import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { subscribe } from "@/lib/marketing";
import { getLocale } from "@/lib/locale";

const MSG = {
  email: { fr: "Indiquez une adresse e-mail valide.", en: "Enter a valid email address." },
  noStore: { fr: "Boutique introuvable.", en: "Store not found." },
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const store = typeof body?.slug === "string" ? await db.store.findUnique({ where: { slug: body.slug } }) : null;
  const locale = store ? await getLocale(store) : "fr";
  const email = z.string().trim().email().safeParse(body?.email);
  if (!email.success || typeof body?.slug !== "string") return NextResponse.json({ error: MSG.email[locale] }, { status: 400 });
  if (!store) return NextResponse.json({ error: MSG.noStore[locale] }, { status: 404 });
  await subscribe(store.id, email.data);
  return NextResponse.json({ ok: true });
}
