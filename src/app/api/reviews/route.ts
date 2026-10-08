import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  slug: z.string(),
  productId: z.string(),
  name: z.string().trim().min(1, "Indiquez votre prénom.").max(60),
  email: z.string().trim().toLowerCase().email("Indiquez une adresse e-mail valide."),
  rating: z.number().int().min(1, "Choisissez une note.").max(5),
  title: z.string().trim().max(120).optional().default(""),
  body: z.string().trim().min(10, "Écrivez au moins quelques mots (10 caractères).").max(3000),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;
  const product = await db.product.findFirst({ where: { id: b.productId, status: "active", store: { slug: b.slug } } });
  if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  const already = await db.review.count({ where: { productId: product.id, email: b.email } });
  if (already >= 2) return NextResponse.json({ error: "Vous avez déjà donné votre avis sur ce produit." }, { status: 429 });
  // « Achat vérifié » : une commande payée de cette adresse contient ce produit.
  const verified = (await db.orderItem.count({ where: { productTitle: product.title, order: { storeId: product.storeId, email: b.email, paymentStatus: "paid" } } })) > 0;
  await db.review.create({ data: { storeId: product.storeId, productId: product.id, name: b.name, email: b.email, rating: b.rating, title: b.title, body: b.body, verified } });
  return NextResponse.json({ ok: true });
}
