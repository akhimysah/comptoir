import { NextResponse, type NextRequest } from "next/server";
import { isPlatformHost, slugForDomain } from "@/lib/domains";

/** Chemins communs à toutes les boutiques, jamais réécrits (fichiers de l'application, API, impressions). */
const SHARED = /^\/(_next|api|print|uploads|brand)(\/|$)|^\/(icon\.png|apple-icon\.png|favicon\.ico)$/;

/**
 * Nom de domaine personnalisé : maboutique.fr/p/bol sert la page /s/<boutique>/p/bol.
 * Les anciennes adresses /s/<boutique>/… y sont redirigées vers l'adresse courte.
 */
export async function proxy(req: NextRequest) {
  const rawHost = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const host = rawHost.replace(/:\d+$/, "");
  if (!host || isPlatformHost(host)) return NextResponse.next();
  const slug = await slugForDomain(host);
  if (!slug) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set("x-store-domain", host);
  const prefix = `/s/${slug}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    // Lien interne de la boutique : adresse courte pour les visiteurs et les moteurs de recherche.
    if (req.method === "GET" || req.method === "HEAD") {
      // Adresse construite sur le domaine demandé par le visiteur (pas sur l'adresse interne du serveur).
      return NextResponse.redirect(new URL(`${pathname.slice(prefix.length) || "/"}${search}`, `${req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "")}://${rawHost}`), 308);
    }
    return NextResponse.next({ request: { headers } });
  }
  // Une autre boutique de la plateforme n'est jamais servie sur ce domaine.
  if (pathname.startsWith("/s/") || pathname.startsWith("/admin") || pathname.startsWith("/legal")) return new NextResponse("Page introuvable", { status: 404 });
  if (SHARED.test(pathname)) return NextResponse.next({ request: { headers } });
  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? prefix : `${prefix}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
