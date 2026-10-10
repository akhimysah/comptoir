import { feedItems } from "@/lib/feeds";
import { appUrl } from "@/lib/stripe";
import { storeBase } from "@/lib/domains";

const x = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Flux produits Google Merchant Center (RSS 2.0) : /s/<boutique>/feeds/google.xml */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feed = await feedItems(slug);
  if (!feed) return new Response("Introuvable", { status: 404 });
  const items = feed.items.map((i) => `<item>
<g:id>${x(i.id)}</g:id><g:item_group_id>${x(i.groupId)}</g:item_group_id><g:title>${x(i.title)}</g:title><g:description>${x(i.description)}</g:description>
<g:link>${x(i.link)}</g:link>${i.image ? `<g:image_link>${x(i.image)}</g:image_link>` : ""}<g:condition>new</g:condition><g:availability>${i.availability}</g:availability>
<g:price>${i.price}</g:price>${i.salePrice ? `<g:sale_price>${i.salePrice}</g:sale_price>` : ""}<g:brand>${x(i.brand)}</g:brand>${i.sku ? `<g:mpn>${x(i.sku)}</g:mpn>` : "<g:identifier_exists>no</g:identifier_exists>"}
</item>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>${x(feed.store.name)}</title><link>${storeBase(feed.store)}</link><description>${x(feed.store.tagline || feed.store.name)}</description>
${items}
</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
