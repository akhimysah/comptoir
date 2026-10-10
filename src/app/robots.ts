import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Les boutiques sur leur propre domaine ont leur fichier robots.txt et leur plan du site là-bas.
  const stores = await db.store.findMany({ where: { OR: [{ domain: null }, { domainVerifiedAt: null }] }, select: { slug: true } });
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/invite", "/reset"] },
    sitemap: stores.map((s) => `${appUrl()}/s/${s.slug}/sitemap.xml`),
  };
}
