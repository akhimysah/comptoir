import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceCart } from "@/lib/pricing";
import { complementaryProducts } from "@/lib/recommendations";
import { storeAccess } from "@/lib/store-access";
import { getCustomer } from "@/lib/customer-auth";
import { getLocale } from "@/lib/locale";
import { translate } from "@/lib/i18n";

const MSG = {
  invalid: { fr: "Requête invalide.", en: "Invalid request." },
  noStore: { fr: "Boutique introuvable.", en: "Store not found." },
  closed: { fr: "Cette boutique n'est pas encore ouverte.", en: "This store isn't open yet." },
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const store = body && typeof body.slug === "string" ? await db.store.findUnique({ where: { slug: body.slug } }) : null;
  const locale = store ? await getLocale(store) : "fr";
  if (!body || typeof body.slug !== "string" || !Array.isArray(body.items)) return NextResponse.json({ error: MSG.invalid[locale] }, { status: 400 });
  if (!store) return NextResponse.json({ error: MSG.noStore[locale] }, { status: 404 });
  if (!(await storeAccess(store)).allowed) return NextResponse.json({ error: MSG.closed[locale] }, { status: 403 });
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const customer = await getCustomer(store.id);
  const cart = await priceCart(store, body.items.slice(0, 100), str(body.code), { country: str(body.country), rateId: str(body.rateId) }, str(body.giftCode), { priceListId: customer?.priceListId, locale });
  // Titres des produits dans la langue du visiteur (affichage seulement).
  if (locale !== "fr" && cart.lines.length) {
    const products = await db.product.findMany({ where: { id: { in: [...new Set(cart.lines.map((l) => l.productId))] } }, select: { id: true, title: true, translations: true } });
    const titles = new Map(products.map((p) => [p.id, translate(p, locale, ["title"]).title]));
    for (const l of cart.lines) l.productTitle = titles.get(l.productId) ?? l.productTitle;
  }
  // « Complétez votre commande » : produits complémentaires de ce qui est déjà dans le panier.
  const recommendations = cart.lines.length ? await complementaryProducts(store.id, [...new Set(cart.lines.map((l) => l.productId))], 3, locale) : [];
  // Client professionnel connecté : délai de paiement proposé au moment de payer.
  return NextResponse.json({ ...cart, recommendations, paymentTermsDays: customer?.paymentTermsDays ?? 0, customerEmail: customer?.email ?? null });
}
