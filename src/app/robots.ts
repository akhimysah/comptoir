import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const stores = await db.store.findMany({ select: { slug: true } });
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/invite", "/reset"] },
    sitemap: stores.map((s) => `${appUrl()}/s/${s.slug}/sitemap.xml`),
  };
}
