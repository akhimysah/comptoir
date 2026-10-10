import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCustomer } from "@/lib/customer-auth";
import { dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const MSG = dict(
  {
    name: "Indiquez votre prénom.",
    email: "Indiquez une adresse e-mail valide.",
    rating: "Choisissez une note.",
    body: "Écrivez au moins quelques mots (10 caractères).",
    noProduct: "Produit introuvable.",
    already: "Vous avez déjà donné votre avis sur ce produit.",
  },
  {
    name: "Enter your first name.",
    email: "Enter a valid email address.",
    rating: "Choose a rating.",
    body: "Write at least a few words (10 characters).",
    noProduct: "Product not found.",
    already: "You've already reviewed this product.",
  },
);

const schemaFor = (t: (typeof MSG)[Locale]) => z.object({
  slug: z.string(),
  productId: z.string(),
  name: z.string().trim().min(1, t.name).max(60),
  email: z.string().trim().toLowerCase().email(t.email),
  rating: z.number().int().min(1, t.rating).max(5),
  title: z.string().trim().max(120).optional().default(""),
  body: z.string().trim().min(10, t.body).max(3000),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const store = typeof raw?.slug === "string" ? await db.store.findUnique({ where: { slug: raw.slug }, select: { id: true, languages: true } }) : null;
  const t = MSG[store ? await getLocale(store) : "fr"];
  const parsed = schemaFor(t).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;
  const product = await db.product.findFirst({ where: { id: b.productId, status: "active", store: { slug: b.slug } } });
  if (!product) return NextResponse.json({ error: t.noProduct }, { status: 404 });
  const already = await db.review.count({ where: { productId: product.id, email: b.email } });
  if (already >= 2) return NextResponse.json({ error: t.already }, { status: 429 });
  // « Achat vérifié » : client connecté (adresse prouvée par son code) dont une commande payée contient ce produit.
  const customer = await getCustomer(product.storeId);
  const verified = Boolean(customer?.email === b.email) && (await db.orderItem.count({ where: { productTitle: product.title, order: { storeId: product.storeId, email: b.email, paymentStatus: { in: ["paid", "partially_refunded"] } } } })) > 0;
  await db.review.create({ data: { storeId: product.storeId, productId: product.id, name: b.name, email: b.email, rating: b.rating, title: b.title, body: b.body, verified } });
  return NextResponse.json({ ok: true });
}
