import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";
import { addStockAlert } from "@/lib/stock-alerts";
import { dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const MSG = dict(
  {
    email: "Indiquez une adresse e-mail valide.",
    tooMany: "Trop de demandes. Réessayez plus tard.",
    noStore: "Boutique introuvable.",
    noItem: "Article introuvable.",
    inStock: "Cet article est de nouveau disponible : vous pouvez le commander.",
  },
  {
    email: "Enter a valid email address.",
    tooMany: "Too many requests. Try again later.",
    noStore: "Store not found.",
    noItem: "Item not found.",
    inStock: "This item is back in stock: you can order it now.",
  },
);

const schemaFor = (t: (typeof MSG)[Locale]) => z.object({ variantId: z.string().max(40), email: z.string().trim().toLowerCase().email(t.email).max(160) });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, languages: true } });
  const locale = store ? await getLocale(store) : "fr";
  const t = MSG[locale];
  const parsed = schemaFor(t).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  // Limite par appareil pour éviter qu'on inscrive des adresses en masse.
  if (!(await hit(`stock-alert:${await clientIp()}`, 20, 3600_000))) return NextResponse.json({ error: t.tooMany }, { status: 429 });
  if (!store) return NextResponse.json({ error: t.noStore }, { status: 404 });
  const res = await addStockAlert(store.id, parsed.data.variantId, parsed.data.email, locale);
  // Messages de src/lib/stock-alerts.ts, dans la langue du visiteur.
  const error = res.error === "Article introuvable." ? t.noItem : res.error?.startsWith("Cet article est de nouveau disponible") ? t.inStock : res.error;
  return NextResponse.json(error ? { error } : { ok: true }, { status: res.error ? 400 : 200 });
}
