import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceCart } from "@/lib/pricing";
import { complementaryProducts } from "@/lib/recommendations";
import { storeAccess } from "@/lib/store-access";
import { getCustomer } from "@/lib/customer-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.slug !== "string" || !Array.isArray(body.items)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const store = await db.store.findUnique({ where: { slug: body.slug } });
  if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  if (!(await storeAccess(store)).allowed) return NextResponse.json({ error: "Cette boutique n'est pas encore ouverte." }, { status: 403 });
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const customer = await getCustomer(store.id);
  const cart = await priceCart(store, body.items.slice(0, 100), str(body.code), { country: str(body.country), rateId: str(body.rateId) }, str(body.giftCode), { priceListId: customer?.priceListId });
  // « Complétez votre commande » : produits complémentaires de ce qui est déjà dans le panier.
  const recommendations = cart.lines.length ? await complementaryProducts(store.id, [...new Set(cart.lines.map((l) => l.productId))], 3) : [];
  // Client professionnel connecté : délai de paiement proposé au moment de payer.
  return NextResponse.json({ ...cart, recommendations, paymentTermsDays: customer?.paymentTermsDays ?? 0, customerEmail: customer?.email ?? null });
}
