import { NextResponse } from "next/server";
import { startConversation } from "@/lib/chat";
import { displayCurrency } from "@/lib/currency";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { activeThemeRow } from "@/lib/liquid/active";
import { cartCookieHeader, lineKey, readCartCookie, shopifyCart, type CookieLine } from "@/lib/liquid/cart";
import { buildPageData, liquidCatalog, shopifyArticle, shopifyBlog, shopifyPage, type BuildOpts } from "@/lib/liquid/data";
import { renderPage, renderSection } from "@/lib/liquid/engine";
import { dbThemeSource, overlaySource, rewriteShopifyCdn } from "@/lib/liquid/source";
import { designModeScript } from "@/lib/liquid/design-mode";
import { accessibleStores, getUser } from "@/lib/auth";
import type { PageData, ShopifyProduct } from "@/lib/liquid/types";
import { getLocale } from "@/lib/locale";
import { subscribe } from "@/lib/marketing";
import { currentMarket } from "@/lib/markets";
import { searchProducts } from "@/lib/search";
import { passCookie, passValue, passwordMatches, storeAccess } from "@/lib/store-access";
import { complementaryProducts } from "@/lib/recommendations";
import { POLICY_LABELS, isPolicyKey, readPolicies } from "@/lib/checkout-settings";

export const dynamic = "force-dynamic";

/**
 * Vitrine rendue par un thème Shopify importé (moteur Liquid). Le proxy réécrit ici les pages de la boutique
 * quand son thème en vigueur est un thème Shopify ; le chemin d'origine arrive dans l'en-tête x-liquid-path.
 * Les adresses sont celles de Shopify (/products/<handle>, /collections/<handle>, /cart, /cart/add.js…),
 * les nôtres (/p/<handle>, /c/<handle>, /blog) sont redirigées.
 */
type Ctx = NonNullable<Awaited<ReturnType<typeof context>>>;

/** Aperçu en direct de l'éditeur : fichiers en cours de modification (non enregistrés) et noms des sections pour les étiquettes. */
type Design = { themeId: string; overrides: Record<string, string>; names: Record<string, string> };

async function context(req: Request, slug: string, path: string, design?: Design) {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return null;
  let theme = await activeThemeRow(store, req);
  if (design) {
    // Mode conception : réservé à l'équipe, sur le thème demandé (publié ou brouillon).
    const user = await getUser();
    if (!user || !(await accessibleStores(user.id)).some((x) => x.id === store.id)) return null;
    const row = await db.storeTheme.findFirst({ where: { id: design.themeId, storeId: store.id } });
    theme = row ? { ...row, preview: true } : null;
  }
  if (!theme || theme.engine !== "liquid") return null;
  const onDomain = req.headers.get("x-store-domain") === store.domain && Boolean(store.domainVerifiedAt);
  const root = onDomain ? "" : `/s/${slug}`;
  const url = new URL(req.url);
  const origin = onDomain ? `${req.headers.get("x-forwarded-proto")?.split(",")[0] || "https"}://${store.domain}` : url.origin;
  const locale = await getLocale(store);
  const [customer, display, market, access] = await Promise.all([getCustomer(store.id), displayCurrency(store), currentMarket(store), storeAccess(store)]);
  const lines = readCartCookie(req.headers.get("cookie"), store.id);
  const { cart, lines: kept } = await shopifyCart(store, lines, root, { priceAdjustBps: market?.priceAdjustBps ?? 0, locale });
  const base = dbThemeSource(theme, root);
  return { store, theme, root, origin, url, path, locale, customer, display, market, access, cart, lines: kept, source: design ? overlaySource(base, design.overrides) : base, onDomain, design };
}

/** Script de mesure d'audience (équivalent de Analytics.tsx) et bandeau d'aperçu d'un brouillon. */
function contentForHeader(c: Ctx) {
  const track = c.theme.preview || c.access.preview ? "" : `<script>(function(){var s=${JSON.stringify(c.store.slug)};var u={};new URLSearchParams(location.search).forEach(function(v,k){if(k.indexOf("utm_")===0)u[k]=v});var d=/Mobi|Android/i.test(navigator.userAgent)?(/iPad|Tablet/i.test(navigator.userAgent)?"tablet":"mobile"):"desktop";function send(t){fetch("/s/"+s+"/track",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({type:t,path:location.pathname,referrer:document.referrer,utm:u,cartItems:${c.cart.item_count},device:d})}).catch(function(){})}send("view");setInterval(function(){if(document.visibilityState==="visible")send("ping")},30000)})();</script>`;
  if (c.design) return `<meta name="generator" content="Revolution Ecom"><meta name="robots" content="noindex">${designModeScript(c.design.names)}`;
  const banner = c.theme.preview ? `<div style="position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#1a1a1a;color:#fff;font:13px system-ui;padding:8px 16px;display:flex;gap:12px;align-items:center;justify-content:center">Aperçu du brouillon « ${c.theme.name.replace(/</g, "&lt;")} » : seule votre équipe le voit. <a href="${c.root}/preview?exit=1" style="color:#fff;text-decoration:underline">Quitter l'aperçu</a></div>` : "";
  return `<meta name="generator" content="Revolution Ecom">${track}${banner}`;
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({ "Content-Type": "application/json; charset=utf-8", ...extra });
const wantsJson = (req: Request, path: string) => /\.(js|json)$/.test(path) || (req.headers.get("accept") ?? "").includes("application/json") || (req.headers.get("content-type") ?? "").includes("application/json");

async function page(c: Ctx, req: Request, template: PageData["template"], extra: Partial<BuildOpts> & { status?: number; setCookie?: string[] } = {}): Promise<Response> {
  const data = await buildPageData({
    store: c.store, root: c.root, origin: c.origin, path: `${c.root}${c.path}`, locale: c.locale, template, cart: c.cart, customer: c.customer,
    priceAdjustBps: c.market?.priceAdjustBps ?? 0, display: c.display, variantId: c.url.searchParams.get("variant"), currentPage: Math.max(1, Number(c.url.searchParams.get("page")) || 1),
    contentForHeader: contentForHeader(c), designMode: Boolean(c.design), ...extra,
  });
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" };
  // Section Rendering API : ?sections=a,b → JSON { a: html }, ?section_id=a → fragment HTML.
  const sections = c.url.searchParams.get("sections");
  if (sections) {
    const out: Record<string, string> = {};
    for (const id of sections.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20)) out[id] = await renderSection(c.source, data, id);
    return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
  }
  const sectionId = c.url.searchParams.get("section_id");
  if (sectionId) return new NextResponse(await renderSection(c.source, data, sectionId), { headers });
  const res = await renderPage(c.source, data);
  const r = new NextResponse(rewriteShopifyCdn(res.html, c.theme, c.root || `/s/${c.store.slug}`), { status: extra.status ?? res.status ?? 200, headers: { ...headers, ...res.headers } });
  for (const sc of extra.setCookie ?? []) r.headers.append("Set-Cookie", sc);
  return r;
}

/** Produit au format /products/<handle>.js (utilisé par les thèmes pour les sélecteurs de variantes). */
const productJson = (p: ShopifyProduct) => ({
  id: p.id, title: p.title, handle: p.handle, description: p.description, published_at: p.published_at, created_at: p.created_at, vendor: p.vendor, type: p.type, tags: p.tags, price: p.price, price_min: p.price_min, price_max: p.price_max, available: p.available, price_varies: p.price_varies, compare_at_price: p.compare_at_price, compare_at_price_min: p.compare_at_price_min, compare_at_price_max: p.compare_at_price_max, compare_at_price_varies: p.compare_at_price_varies,
  variants: p.variants.map((v) => ({ id: v.id, title: v.title, option1: v.option1, option2: v.option2, option3: v.option3, sku: v.sku, requires_shipping: v.requires_shipping, taxable: v.taxable, featured_image: v.featured_image ? { id: v.featured_image.id, src: v.featured_image.src, alt: v.featured_image.alt, width: v.featured_image.width, height: v.featured_image.height } : null, available: v.available, name: `${p.title}${p.has_only_default_variant ? "" : ` - ${v.title}`}`, public_title: p.has_only_default_variant ? null : v.title, options: v.options, price: v.price, weight: v.weight, compare_at_price: v.compare_at_price, inventory_quantity: v.inventory_quantity, inventory_management: v.inventory_management, inventory_policy: v.inventory_policy, barcode: v.barcode, featured_media: v.featured_image ? { id: v.featured_image.id, alt: v.featured_image.alt, position: v.featured_image.position ?? 1, preview_image: { src: v.featured_image.src, width: v.featured_image.width, height: v.featured_image.height, aspect_ratio: 1 } } : null, requires_selling_plan: false, selling_plan_allocations: [] })),
  images: p.images.map((i) => i.src), featured_image: p.featured_image?.src ?? null, options: p.options_with_values.map((o) => ({ name: o.name, position: o.position, values: o.values })), url: p.url,
  media: p.images.map((i, idx) => ({ id: i.id, alt: i.alt, position: idx + 1, media_type: "image", src: i.src, width: i.width, height: i.height, aspect_ratio: 1, preview_image: { src: i.src, width: i.width, height: i.height, aspect_ratio: 1 } })), requires_selling_plan: false, selling_plan_groups: [],
});

async function get(req: Request, c: Ctx): Promise<Response> {
  const { path, root, url, locale } = c;
  const redirect = (to: string) => NextResponse.redirect(new URL(`${root}${to}${url.search}`, url.origin), 301);
  if (!c.access.allowed) {
    if (path === "/password" || path === "/") return page(c, req, "password", { status: 200 });
    return NextResponse.redirect(new URL(`${root}/password`, url.origin), 302);
  }
  // Nos adresses → celles de Shopify, que les thèmes attendent.
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/p\/([^/]+)$/))) return redirect(`/products/${m[1]}`);
  if ((m = path.match(/^\/c\/([^/]+)$/))) return redirect(`/collections/${m[1]}`);
  if (path === "/blog") return redirect("/blogs/news");
  if ((m = path.match(/^\/blog\/([^/]+)$/))) return redirect(`/blogs/news/${m[1]}`);
  if (path === "/products") return redirect("/collections/all");

  if (path === "/" || path === "") return page(c, req, "index");
  if (path === "/cart") return page(c, req, "cart");
  if (path === "/cart.js" || path === "/cart.json") return NextResponse.json(c.cart, { headers: jsonHeaders({ "Cache-Control": "private, no-store" }) });
  if (path === "/checkout") {
    // Pont vers le paiement natif : le panier serveur est recopié dans le navigateur, puis la page de paiement de l'app s'ouvre.
    const items = c.lines.map((l) => ({ variantId: l.v, quantity: l.q }));
    return new NextResponse(`<!doctype html><meta charset="utf-8"><title>Paiement…</title><script>try{localStorage.setItem(${JSON.stringify(`comptoir:cart:${c.store.slug}`)},${JSON.stringify(JSON.stringify(items))})}catch(e){}location.replace(${JSON.stringify(`/s/${c.store.slug}/cart?checkout=1`)})</script>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const catalog = () => liquidCatalog(c.store, root, locale, c.market?.priceAdjustBps ?? 0, url.searchParams.get("variant"));
  if ((m = path.match(/^\/products\/([^/]+?)(\.js|\.json)?$/))) {
    const { products } = await catalog();
    const product = products.find((p) => p.handle === m![1]);
    if (!product) return m[2] ? NextResponse.json({ error: "Not found" }, { status: 404 }) : page(c, req, "404", { status: 404 });
    if (m[2]) return NextResponse.json(m[2] === ".json" ? { product: productJson(product) } : productJson(product), { headers: jsonHeaders({ "Cache-Control": "private, max-age=60" }) });
    const recommendations = { performed: true, products: products.filter((p) => p.id !== product.id && p.collections.some((cc) => product.collections.some((pc) => pc.handle === cc.handle))).slice(0, 4), products_count: 0, intent: "related" };
    recommendations.products_count = recommendations.products.length;
    return page(c, req, "product", { pageObjects: { product, recommendations, page_description: product.description.replace(/<[^>]+>/g, "").slice(0, 160) } });
  }
  if (path === "/collections") return page(c, req, "list-collections", { pageObjects: { page_title: "Collections" } });
  if ((m = path.match(/^\/collections\/([^/]+?)(\/products\.json)?$/))) {
    const { collections } = await catalog();
    const collection = collections.find((x) => x.handle === m![1]);
    if (!collection) return m[2] ? NextResponse.json({ products: [] }, { status: 404 }) : page(c, req, "404", { status: 404 });
    if (m[2]) return NextResponse.json({ products: collection.products.map(productJson) }, { headers: jsonHeaders() });
    const sortBy = url.searchParams.get("sort_by") ?? collection.default_sort_by;
    const sorted = [...collection.products];
    if (sortBy === "price-ascending") sorted.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-descending") sorted.sort((a, b) => b.price - a.price);
    else if (sortBy === "title-ascending") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "title-descending") sorted.sort((a, b) => b.title.localeCompare(a.title));
    else if (sortBy === "created-ascending") sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return page(c, req, "collection", { pageObjects: { collection: { ...collection, products: sorted, sort_by: sortBy } } });
  }
  if ((m = path.match(/^\/collections\/([^/]+)\/products\/([^/]+)$/))) return redirect(`/products/${m[2]}`);
  if (path === "/search" || path === "/search/suggest" || path === "/search/suggest.json") {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const { products, collections } = await catalog();
    const hits = q ? await searchProducts(c.store.id, q, locale) : [];
    const found = hits.map((h) => products.find((p) => p.id === h.id)).filter((x): x is ShopifyProduct => Boolean(x));
    const pages = q ? (await db.page.findMany({ where: { storeId: c.store.id, published: true } })).map((p) => shopifyPage(p, root, locale)).filter((p) => p.title.toLowerCase().includes(q.toLowerCase())) : [];
    const posts = q ? (await db.blogPost.findMany({ where: { storeId: c.store.id, published: true } })).map((a) => shopifyArticle(a, root, locale)).filter((a) => a.title.toLowerCase().includes(q.toLowerCase())) : [];
    const cols = q ? collections.filter((x) => x.handle !== "all" && x.title.toLowerCase().includes(q.toLowerCase())) : [];
    if (path !== "/search") {
      const lim = Math.min(10, Number(url.searchParams.get("resources[limit]") ?? url.searchParams.get("limit")) || 4);
      return NextResponse.json({ resources: { results: { products: found.slice(0, lim).map(productJson), collections: cols.slice(0, lim).map((x) => ({ id: x.id, title: x.title, handle: x.handle, url: x.url, image: x.image?.src ?? null, featured_image: x.image ? { url: x.image.src, alt: x.image.alt } : null })), pages: pages.slice(0, lim).map((p) => ({ id: p.id, title: p.title, handle: p.handle, url: p.url, body: p.content })), articles: posts.slice(0, lim).map((a) => ({ id: a.id, title: a.title, handle: a.handle, url: a.url, image: a.image?.src ?? null, summary_html: a.excerpt, published_at: a.published_at })), queries: [] } } }, { headers: jsonHeaders() });
    }
    const results = [...found, ...posts, ...pages];
    return page(c, req, "search", { pageObjects: { search: { performed: Boolean(q), terms: q, results, results_count: results.length, types: ["product", "article", "page"], default_sort_by: "relevance", sort_by: "relevance", sort_options: [{ name: "Pertinence", value: "relevance" }], filters: [] }, predictive_search: { performed: Boolean(q), terms: q, resources: { products: found.slice(0, 6), collections: cols.slice(0, 3), pages: pages.slice(0, 3), articles: posts.slice(0, 3), queries: [] } }, page_title: q ? `${locale === "en" ? "Search results for" : "Résultats pour"} « ${q} »` : locale === "en" ? "Search" : "Recherche" } });
  }
  if ((m = path.match(/^\/pages\/([^/]+)$/))) {
    const row = await db.page.findFirst({ where: { storeId: c.store.id, handle: m[1], published: true } });
    if (!row) return page(c, req, "404", { status: 404 });
    return page(c, req, "page", { templateSuffix: m[1] === "contact" ? "contact" : undefined, pageObjects: { page: shopifyPage(row, root, locale) } });
  }
  if ((m = path.match(/^\/policies\/([^/]+)$/)) && isPolicyKey(m[1])) {
    const pol = readPolicies(c.store.policies)[m[1]];
    if (!pol.published || !pol.body) return page(c, req, "404", { status: 404 });
    return page(c, req, "page", { pageObjects: { page: { id: m[1], title: POLICY_LABELS[m[1]][locale], handle: m[1], url: `${root}/policies/${m[1]}`, content: pol.body, author: "", published_at: "", template_suffix: "" } } });
  }
  if ((m = path.match(/^\/blogs\/([^/]+)$/))) {
    const posts = await db.blogPost.findMany({ where: { storeId: c.store.id, published: true }, orderBy: { publishedAt: "desc" } });
    return page(c, req, "blog", { pageObjects: { blog: shopifyBlog(posts, root, locale, m[1]) } });
  }
  if ((m = path.match(/^\/blogs\/([^/]+)\/([^/]+)$/))) {
    const [row, posts] = await Promise.all([db.blogPost.findFirst({ where: { storeId: c.store.id, handle: m[2], published: true } }), db.blogPost.findMany({ where: { storeId: c.store.id, published: true }, orderBy: { publishedAt: "desc" } })]);
    if (!row) return page(c, req, "404", { status: 404 });
    return page(c, req, "article", { pageObjects: { article: shopifyArticle(row, root, locale, m[1]), blog: shopifyBlog(posts, root, locale, m[1]) } });
  }
  if (path === "/recommendations/products" || path === "/recommendations/products.json") {
    const id = url.searchParams.get("product_id") ?? "";
    const limit = Math.min(10, Number(url.searchParams.get("limit")) || 4);
    const { products } = await catalog();
    const recs = (await complementaryProducts(c.store.id, [id], limit, locale)).map((r) => products.find((p) => p.id === r.id)).filter((x): x is ShopifyProduct => Boolean(x));
    const fallback = products.filter((p) => p.id !== id).slice(0, limit);
    const list = recs.length ? recs : fallback;
    if (url.searchParams.get("section_id")) return page(c, req, "product", { pageObjects: { recommendations: { performed: true, products: list, products_count: list.length, intent: url.searchParams.get("intent") ?? "related" } } });
    return NextResponse.json({ products: list.map(productJson) }, { headers: jsonHeaders() });
  }
  if (path === "/account" || path.startsWith("/account/")) return NextResponse.redirect(new URL(`/s/${c.store.slug}/account`, url.origin), 302);
  // Redirections enregistrées par le marchand (Navigation → Redirections).
  const r = await db.redirect.findUnique({ where: { storeId_fromPath: { storeId: c.store.id, fromPath: path.replace(/\/$/, "") || "/" } } });
  if (r) { await db.redirect.update({ where: { id: r.id }, data: { hits: { increment: 1 } } }); return NextResponse.redirect(new URL(r.toPath.startsWith("/") ? `${root}${r.toPath === "/" ? "" : r.toPath}` : r.toPath, url.origin), 301); }
  return page(c, req, "404", { status: 404 });
}

/** Corps d'une requête : JSON ou formulaire, aplati (properties[x] → properties: { x }). */
async function body(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return ((await req.json().catch(() => null)) as Record<string, unknown>) ?? {};
  const fd = await req.formData().catch(() => null);
  const out: Record<string, unknown> = {};
  if (!fd) return out;
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) continue;
    const m = k.match(/^(\w+)\[([^\]]*)\]$/);
    if (m) { const o = (out[m[1]] ??= {}) as Record<string, string>; o[m[2]] = v; }
    else out[k] = v;
  }
  return out;
}

async function post(req: Request, c: Ctx): Promise<Response> {
  const { path, root, url } = c;
  const b = await body(req);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const json = wantsJson(req, path);
  const withCart = async (lines: CookieLine[], payload?: unknown, status = 200) => {
    const { cart, lines: kept } = await shopifyCart(c.store, lines, root, { priceAdjustBps: c.market?.priceAdjustBps ?? 0, locale: c.locale });
    const cookie = cartCookieHeader(c.store.id, kept);
    if (json || payload) {
      const out = payload ?? cart;
      // Les thèmes demandent souvent les sections à rafraîchir avec la réponse (tiroir du panier).
      const sections = str(b.sections);
      const res = NextResponse.json(sections ? { ...(out as object), sections: Object.fromEntries(await Promise.all(sections.split(",").map(async (id) => [id, await renderSection(c.source, await buildPageData({ store: c.store, root, origin: c.origin, path: `${root}/cart`, locale: c.locale, template: "cart", cart, customer: c.customer, priceAdjustBps: c.market?.priceAdjustBps ?? 0, display: c.display }), id.trim())]))) } : out, { status, headers: jsonHeaders({ "Cache-Control": "no-store" }) });
      res.headers.append("Set-Cookie", cookie);
      return res;
    }
    const res = NextResponse.redirect(new URL(`${root}/cart`, url.origin), 303);
    res.headers.append("Set-Cookie", cookie);
    return res;
  };
  const props = (v: unknown) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => !k.startsWith("_") && typeof x === "string").map(([k, x]) => [k.slice(0, 60), String(x).slice(0, 200)])) : undefined);

  if (path === "/cart/add" || path === "/cart/add.js") {
    const items = Array.isArray(b.items) ? (b.items as { id?: unknown; quantity?: unknown; properties?: unknown }[]) : [{ id: b.id, quantity: b.quantity, properties: b.properties }];
    const lines = [...c.lines];
    const added: string[] = [];
    for (const it of items.slice(0, 20)) {
      const id = String(it.id ?? ""); const q = Math.max(1, Math.min(999, Math.floor(Number(it.quantity ?? 1)) || 1));
      if (!id) continue;
      const v = await db.variant.findFirst({ where: { id, product: { storeId: c.store.id, status: "active" } }, select: { id: true } });
      if (!v) return json ? NextResponse.json({ status: 422, message: "Cart Error", description: c.locale === "en" ? "This product is unavailable." : "Ce produit n'est pas disponible." }, { status: 422 }) : NextResponse.redirect(new URL(`${root}/cart`, url.origin), 303);
      const p = props(it.properties);
      const line: CookieLine = { v: id, q, p };
      const same = lines.find((l) => lineKey(l) === lineKey(line));
      if (same) same.q += q; else lines.push(line);
      added.push(lineKey(line));
    }
    const { cart } = await shopifyCart(c.store, lines, root, { priceAdjustBps: c.market?.priceAdjustBps ?? 0, locale: c.locale });
    const addedItems = cart.items.filter((i) => added.includes(i.key));
    return withCart(lines, json ? (Array.isArray(b.items) ? { items: addedItems } : addedItems[0] ?? { items: [] }) : undefined);
  }
  if (path === "/cart/change" || path === "/cart/change.js") {
    const q = Math.max(0, Math.floor(Number(b.quantity)) || 0);
    const lines = [...c.lines];
    const idx = b.line ? Number(b.line) - 1 : lines.findIndex((l) => lineKey(l) === String(b.id) || l.v === String(b.id));
    if (idx >= 0 && idx < lines.length) lines[idx] = { ...lines[idx], q };
    return withCart(lines.filter((l) => l.q > 0));
  }
  if (path === "/cart/update" || path === "/cart/update.js") {
    const updates = b.updates;
    let lines = [...c.lines];
    if (Array.isArray(updates)) lines = lines.map((l, i) => ({ ...l, q: updates[i] === undefined ? l.q : Math.max(0, Math.floor(Number(updates[i])) || 0) }));
    else if (updates && typeof updates === "object") for (const [k, v] of Object.entries(updates as Record<string, unknown>)) { const l = lines.find((x) => lineKey(x) === k || x.v === k); if (l) l.q = Math.max(0, Math.floor(Number(v)) || 0); }
    return withCart(lines.filter((l) => l.q > 0));
  }
  if (path === "/cart/clear" || path === "/cart/clear.js") return withCart([]);
  if (path === "/cart") {
    if (str(b.checkout) || "checkout" in b) return NextResponse.redirect(new URL(`${root}/checkout`, url.origin), 303);
    const updates = b.updates;
    let lines = [...c.lines];
    if (Array.isArray(updates)) lines = lines.map((l, i) => ({ ...l, q: Math.max(0, Math.floor(Number(updates[i])) || 0) }));
    return withCart(lines.filter((l) => l.q > 0));
  }
  if (path === "/localization") {
    const res = NextResponse.redirect(new URL(str(b.return_to) && str(b.return_to).startsWith("/") ? str(b.return_to) : `${root}/`, url.origin), 303);
    const lang = str(b.language_code).toLowerCase();
    if (lang === "fr" || lang === "en") res.cookies.set(`lang_${c.store.id}`, lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
    return res;
  }
  if (path === "/password") {
    if (passwordMatches(c.store, str(b.password))) {
      const res = NextResponse.redirect(new URL(`${root}/`, url.origin), 303);
      res.cookies.set(passCookie(c.store.id), passValue(c.store), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
      return res;
    }
    return page(c, req, "password", { formResults: { storefront_password: { posted_successfully: false, errors: [c.locale === "en" ? "Wrong password." : "Mot de passe incorrect."], fields: {} } } });
  }
  const formType = str(b.form_type);
  if (path === "/contact" || formType === "contact") {
    const email = str((b.contact as Record<string, string> | undefined)?.email ?? b.email);
    const name = str((b.contact as Record<string, string> | undefined)?.name ?? b.name) || email.split("@")[0];
    const msg = str((b.contact as Record<string, string> | undefined)?.body ?? (b.contact as Record<string, string> | undefined)?.message ?? b.body ?? b.message);
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && msg.length > 0;
    if (ok) await startConversation(c.store.id, name, email, msg);
    const back = str(b.return_to) || "/pages/contact";
    const handle = back.match(/\/pages\/([^/?#]+)/)?.[1];
    const row = handle ? await db.page.findFirst({ where: { storeId: c.store.id, handle, published: true } }) : null;
    return page(c, req, row ? "page" : "index", { templateSuffix: handle === "contact" ? "contact" : undefined, pageObjects: row ? { page: shopifyPage(row, root, c.locale) } : {}, formResults: { contact: { posted_successfully: ok, errors: ok ? [] : [c.locale === "en" ? "Please enter a valid email and a message." : "Indiquez un e-mail valide et un message."], fields: { email, name, body: msg } } } });
  }
  if (path === "/newsletter" || formType === "customer") {
    const email = str((b.contact as Record<string, string> | undefined)?.email ?? b.email);
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (ok) await subscribe(c.store.id, email);
    const back = str(b.return_to);
    if (json) return NextResponse.json({ ok }, { status: ok ? 200 : 422 });
    return page(c, req, back.includes("/cart") ? "cart" : "index", { formResults: { customer: { posted_successfully: ok, errors: ok ? [] : [c.locale === "en" ? "Please enter a valid email." : "Indiquez un e-mail valide."], fields: { email } } } });
  }
  if (path.startsWith("/account")) return NextResponse.redirect(new URL(`/s/${c.store.slug}/account`, url.origin), 303);
  return page(c, req, "404", { status: 404 });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug } = await params;
  const path = req.headers.get("x-liquid-path") ?? `/${((await params).path ?? []).join("/")}`;
  const c = await context(req, slug, path);
  if (!c) return new NextResponse("Page introuvable", { status: 404 });
  return get(req, c);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug } = await params;
  const path = req.headers.get("x-liquid-path") ?? `/${((await params).path ?? []).join("/")}`;
  if (path === "/design-preview") {
    // Éditeur : rendu d'une page avec les fichiers en cours de modification, sans rien enregistrer.
    const b = (await req.json().catch(() => null)) as { themeId?: string; path?: string; overrides?: Record<string, string>; names?: Record<string, string> } | null;
    if (!b?.themeId || typeof b.path !== "string") return new NextResponse("Requête invalide", { status: 400 });
    const overrides = Object.fromEntries(Object.entries(b.overrides ?? {}).filter(([k, v]) => /^(templates|sections|config)\/[\w./-]+\.json$/.test(k) && typeof v === "string" && v.length < 1_000_000).slice(0, 40));
    const target = new URL(b.path.startsWith("/") ? b.path : `/${b.path}`, req.url);
    const c = await context(new Request(target, { headers: req.headers }), slug, target.pathname, { themeId: b.themeId, overrides, names: b.names ?? {} });
    if (!c) return new NextResponse("Page introuvable", { status: 404 });
    return get(new Request(target, { headers: req.headers }), c);
  }
  const c = await context(req, slug, path);
  if (!c) return new NextResponse("Page introuvable", { status: 404 });
  return post(req, c);
}

export const HEAD = GET;
