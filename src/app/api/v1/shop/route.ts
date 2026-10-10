import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api";
import { appUrl } from "@/lib/stripe";
import { storeBase } from "@/lib/domains";

/** Informations de la boutique (accessible avec n'importe quel droit de lecture des produits). */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read_products");
  if ("response" in auth) return auth.response;
  const s = auth.store;
  return NextResponse.json({ data: { id: s.id, name: s.name, slug: s.slug, currency: s.currency, url: `${storeBase(s)}`, taxRateBps: s.taxRateBps } });
}
