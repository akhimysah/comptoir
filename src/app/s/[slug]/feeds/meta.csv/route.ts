import { feedItems } from "@/lib/feeds";

const c = (v: string | null) => { const s = v ?? ""; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Catalogue Meta (Facebook et Instagram Shopping) au format CSV : /s/<boutique>/feeds/meta.csv */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feed = await feedItems(slug);
  if (!feed) return new Response("Introuvable", { status: 404 });
  const head = ["id", "item_group_id", "title", "description", "availability", "condition", "price", "sale_price", "link", "image_link", "brand"];
  const rows = feed.items.map((i) => [i.id, i.groupId, i.title, i.description, i.availability, "new", i.price, i.salePrice, i.link, i.image, i.brand].map(c).join(","));
  return new Response([head.join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
