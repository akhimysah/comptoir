import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api";
import { appUrl } from "@/lib/stripe";

/** Informations de la boutique (accessible avec n'importe quel droit de lecture des produits). */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read_products");
  if ("response" in auth) return auth.response;
  const s = auth.store;
  return NextResponse.json({ data: { id: s.id, name: s.name, slug: s.slug, currency: s.currency, url: `${appUrl()}/s/${s.slug}`, taxRateBps: s.taxRateBps } });
}
