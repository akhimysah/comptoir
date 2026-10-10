import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";
import { addStockAlert } from "@/lib/stock-alerts";

const schema = z.object({ variantId: z.string().max(40), email: z.string().trim().toLowerCase().email("Indiquez une adresse e-mail valide.").max(160) });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  // Limite par appareil pour éviter qu'on inscrive des adresses en masse.
  if (!(await hit(`stock-alert:${await clientIp()}`, 20, 3600_000))) return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  const res = await addStockAlert(store.id, parsed.data.variantId, parsed.data.email);
  return NextResponse.json(res.error ? res : { ok: true }, { status: res.error ? 400 : 200 });
}
