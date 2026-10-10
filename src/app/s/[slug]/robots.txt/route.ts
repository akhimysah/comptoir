import { db } from "@/lib/db";
import { storeBase } from "@/lib/domains";

export const dynamic = "force-dynamic";

/** robots.txt d'une boutique servie sur son propre domaine (maboutique.fr/robots.txt). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return new Response("Introuvable", { status: 404 });
  const body = store.passwordEnabled
    ? "User-agent: *\nDisallow: /\n" // boutique en préparation : rien à indexer
    : `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /account\nDisallow: /pay/\nDisallow: /order/\nSitemap: ${storeBase(store)}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
