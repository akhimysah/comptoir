import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/storefront";
import { storeAccess } from "@/lib/store-access";

async function context(slug: string) {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store || !(await storeAccess(store)).allowed) return null;
  return { store, customer: await getCustomer(store.id) };
}

const ids = (s: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 100);

/** Favoris du client connecté ; avec ?cards=a,b : les fiches produits correspondantes (pour la page « Mes favoris »). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await context((await params).slug);
  if (!ctx) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.has("cards")) {
    const wanted = ids(url.searchParams.get("cards"));
    const { products } = await getCatalog(ctx.store.id);
    return NextResponse.json({ products: wanted.map((id) => products.find((p) => p.id === id)).filter(Boolean) });
  }
  if (!ctx.customer) return NextResponse.json({ loggedIn: false, ids: [] }, { headers: { "Cache-Control": "no-store" } });
  const favs = await db.favorite.findMany({ where: { customerId: ctx.customer.id, storeId: ctx.store.id }, orderBy: { createdAt: "desc" }, select: { productId: true } });
  return NextResponse.json({ loggedIn: true, ids: favs.map((f) => f.productId) }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.union([
  z.object({ action: z.literal("set"), productId: z.string().max(40), on: z.boolean() }),
  z.object({ action: z.literal("merge"), ids: z.array(z.string().max(40)).max(100) }),
]);

/** Ajout / retrait d'un favori, ou fusion des favoris gardés dans le navigateur avant la connexion. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await context((await params).slug);
  if (!ctx) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!ctx.customer) return NextResponse.json({ loggedIn: false });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const b = parsed.data;
  const wanted = b.action === "set" ? [b.productId] : b.ids;
  // Seulement des produits de cette boutique.
  const valid = new Set((await db.product.findMany({ where: { storeId: ctx.store.id, id: { in: wanted } }, select: { id: true } })).map((p) => p.id));
  const base = { storeId: ctx.store.id, customerId: ctx.customer.id };
  if (b.action === "set" && !b.on) await db.favorite.deleteMany({ where: { ...base, productId: b.productId } });
  else for (const productId of wanted.filter((id) => valid.has(id))) await db.favorite.upsert({ where: { customerId_productId: { customerId: ctx.customer.id, productId } }, update: {}, create: { ...base, productId } });
  const favs = await db.favorite.findMany({ where: base, orderBy: { createdAt: "desc" }, select: { productId: true } });
  return NextResponse.json({ loggedIn: true, ids: favs.map((f) => f.productId) });
}
