import "server-only";
import type { BlogPost, Collection, Customer, Page, Product, Store, Variant } from "@prisma/client";
import { db } from "../db";
import { POLICY_KEYS, POLICY_LABELS, readPolicies } from "../checkout-settings";
import { translate, type Locale } from "../i18n";
import { storeLocales } from "../locale";
import { adjustPrice } from "../markets";
import { resolveMenus, type ResolvedLink } from "../navigation";
import { parseJson } from "../utils";
import type { PageData, ShopifyArticle, ShopifyBlog, ShopifyCart, ShopifyCollection, ShopifyCollectionRef, ShopifyCustomer, ShopifyImage, ShopifyLink, ShopifyLinklist, ShopifyPage, ShopifyProduct, ShopifyShop, ShopifyVariant } from "./types";

/** Produit de la base avec ses variantes et ses collections. */
export type FullProduct = Product & { variants: Variant[]; collections: { collection: Pick<Collection, "handle"> }[] };

const DEFAULT_TITLES = new Set(["Par défaut", "Default Title", "Default"]);
const handleize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Nos images n'ont pas de dimensions connues : un carré par défaut, les thèmes s'en servent pour les ratios. */
export const image = (src: string | null | undefined, alt = "", id = "", position?: number): ShopifyImage | null =>
  src ? { id: id || src, src, alt, width: 1200, height: 1200, aspect_ratio: 1, position, media_type: "image" } : null;

/** Produit au format Shopify. `adj` : ajustement de prix du marché (points de base). */
export function shopifyProduct(p: FullProduct, root: string, locale: Locale, adj = 0, selectedVariantId?: string | null): ShopifyProduct {
  const t = translate(p, locale, ["title", "description"]);
  const images = parseJson<string[]>(p.images, []).map((src, i) => image(src, t.title, `${p.id}-${i}`, i + 1)!);
  const options = parseJson<{ name: string; values: string[] }[]>(p.options, []).filter((o) => o.name?.trim());
  const price = (c: number) => (p.isGiftCard ? c : adjustPrice(c, adj));
  const url = `${root}/products/${p.handle}`;
  const variants: ShopifyVariant[] = [...p.variants].sort((a, b) => a.position - b.position).map((v) => {
    const values = parseJson<string[]>(v.optionValues, []);
    const img = v.image ? images.find((i) => i.src === v.image) ?? image(v.image, t.title, v.id) : null;
    const available = p.isGiftCard || p.continueSelling || v.stock > 0;
    return {
      id: v.id, title: v.title, sku: v.sku, barcode: v.barcode, price: price(v.priceCents), compare_at_price: v.compareAtCents === null ? null : price(v.compareAtCents), available,
      inventory_quantity: v.stock, inventory_management: p.isGiftCard ? null : "shopify", inventory_policy: p.continueSelling ? "continue" : "deny",
      option1: values[0] ?? (options.length ? null : v.title), option2: values[1] ?? null, option3: values[2] ?? null, options: options.length ? values : [v.title],
      featured_image: img, image: img, weight: v.weightGrams / 1000, weight_unit: "kg", requires_shipping: !p.isGiftCard, taxable: p.taxable, url: `${url}?variant=${v.id}`, product_id: p.id,
    };
  });
  const prices = variants.map((v) => v.price);
  const compares = variants.map((v) => v.compare_at_price ?? 0);
  const first = variants.find((v) => v.available) ?? null;
  const selected = selectedVariantId ? variants.find((v) => v.id === selectedVariantId) ?? null : null;
  const optionsWithValues = options.map((o, i) => ({ name: o.name, position: i + 1, values: [...new Set(variants.map((v) => v.options[i]).filter(Boolean))], selected_value: (selected ?? first ?? variants[0])?.options[i] }));
  const tags = p.tags.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    id: p.id, title: t.title, handle: p.handle, description: t.description, content: t.description, vendor: p.vendor, type: p.productType, tags,
    price: Math.min(...prices), price_min: Math.min(...prices), price_max: Math.max(...prices), price_varies: Math.min(...prices) !== Math.max(...prices),
    compare_at_price: Math.max(...compares) || null, compare_at_price_min: Math.min(...compares), compare_at_price_max: Math.max(...compares), compare_at_price_varies: Math.min(...compares) !== Math.max(...compares),
    available: variants.some((v) => v.available), featured_image: images[0] ?? null, featured_media: images[0] ?? null, images, media: images, variants,
    options: options.length ? options.map((o) => o.name) : ["Title"], options_with_values: options.length ? optionsWithValues : [{ name: "Title", position: 1, values: [variants[0]?.title ?? "Default Title"] }],
    options_by_name: Object.fromEntries(optionsWithValues.map((o) => [o.name, o])), has_only_default_variant: variants.length === 1 && DEFAULT_TITLES.has(variants[0].title),
    selected_or_first_available_variant: selected ?? first ?? variants[0] ?? null, selected_variant: selected, first_available_variant: first, url,
    collections: p.collections.map((c) => ({ id: c.collection.handle, title: c.collection.handle, handle: c.collection.handle, url: `${root}/collections/${c.collection.handle}`, image: null, products_count: 0, description: "" })),
    created_at: p.createdAt.toISOString(), published_at: p.createdAt.toISOString(), gift_card: p.isGiftCard, requires_selling_plan: false, template_suffix: "", metafields: { custom: parseJson<Record<string, unknown>>(p.metafields, {}) },
  };
}

export function shopifyCollection(c: Collection & { products?: { productId: string }[] }, products: ShopifyProduct[], root: string, locale: Locale, extra: Partial<ShopifyCollection> = {}): ShopifyCollection {
  const t = translate(c, locale, ["title", "description"]);
  const ref: ShopifyCollectionRef = { id: c.id, title: t.title, handle: c.handle, url: `${root}/collections/${c.handle}`, image: image(c.image, t.title), products_count: products.length, description: t.description };
  return {
    ...ref, products, all_products_count: products.length, all_tags: [...new Set(products.flatMap((p) => p.tags))].sort(), all_types: [...new Set(products.map((p) => p.type).filter(Boolean))], all_vendors: [...new Set(products.map((p) => p.vendor).filter(Boolean))],
    sort_by: "manual", default_sort_by: "manual", sort_options: [{ name: "Fonctionnalités", value: "manual" }, { name: "Meilleures ventes", value: "best-selling" }, { name: "Alphabétique, de A à Z", value: "title-ascending" }, { name: "Alphabétique, de Z à A", value: "title-descending" }, { name: "Prix : faible à élevé", value: "price-ascending" }, { name: "Prix : élevé à faible", value: "price-descending" }, { name: "Date, de la plus ancienne à la plus récente", value: "created-ascending" }, { name: "Date, de la plus récente à la plus ancienne", value: "created-descending" }],
    current_type: null, current_vendor: null, template_suffix: "", featured_image: image(c.image, t.title) ?? products[0]?.featured_image ?? null, filters: [], ...extra,
  };
}

/** Collection virtuelle « all » : tous les produits, comme /collections/all sur Shopify. */
export const allCollection = (products: ShopifyProduct[], root: string, locale: Locale): ShopifyCollection =>
  shopifyCollection({ id: "all", storeId: "", title: locale === "en" ? "Products" : "Produits", handle: "all", description: "", translations: "{}", image: null, seoTitle: "", seoDescription: "", createdAt: new Date(0) }, products, root, locale);

export function shopifyPage(p: Page, root: string, locale: Locale): ShopifyPage {
  const t = translate(p, locale, ["title", "body"]);
  return { id: p.id, title: t.title, handle: p.handle, url: `${root}/pages/${p.handle}`, content: t.body, author: "", published_at: p.createdAt.toISOString(), template_suffix: "" };
}

export function shopifyArticle(a: BlogPost, root: string, locale: Locale, blogHandle = "news"): ShopifyArticle {
  const t = a;
  const date = (a.publishedAt ?? a.createdAt).toISOString();
  return { id: a.id, title: t.title, handle: a.handle, url: `${root}/blogs/${blogHandle}/${a.handle}`, author: a.author, content: t.body, excerpt: t.excerpt, excerpt_or_content: t.excerpt || t.body, image: image(a.image, t.title), published_at: date, created_at: a.createdAt.toISOString(), tags: [], comments_count: 0, comments_enabled: false, moderated: false, user: { first_name: a.author, last_name: "", name: a.author } };
}

export function shopifyBlog(posts: BlogPost[], root: string, locale: Locale, handle = "news"): ShopifyBlog {
  const articles = posts.map((a) => shopifyArticle(a, root, locale, handle));
  return { id: handle, title: locale === "en" ? "News" : "Actualités", handle, url: `${root}/blogs/${handle}`, articles, articles_count: articles.length, all_tags: [], tags: [], comments_enabled: false, moderated: false };
}

function links(items: ResolvedLink[], slug: string, root: string, path: string): ShopifyLink[] {
  const fix = (h: string) => (h.startsWith(`/s/${slug}`) ? `${root}${h.slice(`/s/${slug}`.length)}` || root : h).replace(/\/p\//, "/products/").replace(/\/c\//, "/collections/").replace(/\/blog(\/|$)/, "/blogs/news$1");
  return items.map((l) => {
    const url = fix(l.href);
    const children = links(l.children, slug, root, path);
    const current = url === path;
    return { title: l.title, url, active: current, current, child_active: children.some((c) => c.active || c.child_active), child_current: children.some((c) => c.current), levels: children.length ? 1 + Math.max(...children.map((c) => c.levels)) : 0, links: children, type: url.includes("/collections/") ? "collection_link" : url.includes("/products/") ? "product_link" : url.includes("/pages/") ? "page_link" : "frontpage_link", handle: handleize(l.title) };
  });
}

export function shopifyCustomer(c: Customer | null): ShopifyCustomer {
  if (!c) return null;
  const [first_name, ...rest] = c.name.split(" ");
  return { id: c.id, email: c.email, name: c.name, first_name, last_name: rest.join(" "), accepts_marketing: c.acceptsMarketing, orders_count: 0, total_spent: 0, tags: c.tags.split(",").map((x) => x.trim()).filter(Boolean), has_account: true, phone: c.phone ?? "", default_address: null, addresses: [], addresses_count: 0, tax_exempt: c.taxExempt };
}

const MONEY: Record<string, { format: string; withCurrency: string }> = {
  EUR: { format: "{{amount_with_comma_separator}} €", withCurrency: "{{amount_with_comma_separator}} € EUR" },
  CHF: { format: "CHF {{amount_with_apostrophe_separator}}", withCurrency: "CHF {{amount_with_apostrophe_separator}}" },
  GBP: { format: "£{{amount}}", withCurrency: "£{{amount}} GBP" },
  USD: { format: "${{amount}}", withCurrency: "${{amount}} USD" },
  CAD: { format: "${{amount}}", withCurrency: "${{amount}} CAD" },
  JPY: { format: "¥{{amount_no_decimals}}", withCurrency: "¥{{amount_no_decimals}} JPY" },
};
export const moneyFormat = (currency: string) => MONEY[currency] ?? { format: `{{amount_with_comma_separator}} ${currency}`, withCurrency: `{{amount_with_comma_separator}} ${currency}` };

export type BuildOpts = {
  store: Store;
  /** Racine publique de la boutique : "/s/<slug>" ou "" sur un domaine. */
  root: string;
  origin: string;
  path: string;
  locale: Locale;
  template: PageData["template"];
  templateSuffix?: string;
  cart: ShopifyCart;
  customer: Customer | null;
  /** Ajustement de prix du marché (points de base) et taux de la devise d'affichage. */
  priceAdjustBps?: number;
  display?: { code: string; rate: number };
  designMode?: boolean;
  contentForHeader?: string;
  /** Identifiant de variante demandé (?variant=). */
  variantId?: string | null;
  currentPage?: number;
  formResults?: PageData["form_results"];
  pageObjects?: Partial<Pick<PageData, "product" | "collection" | "page" | "blog" | "article" | "search" | "recommendations" | "predictive_search" | "page_title" | "page_description">>;
};

/** Catalogue complet de la boutique au format Shopify (produits actifs et collections), chargé une fois par requête. */
export async function liquidCatalog(store: Store, root: string, locale: Locale, adj = 0, variantId?: string | null) {
  const [products, collections] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: "active" }, include: { variants: true, collections: { include: { collection: { select: { handle: true } } } } }, orderBy: { createdAt: "desc" } }),
    db.collection.findMany({ where: { storeId: store.id }, include: { products: { select: { productId: true } } }, orderBy: { title: "asc" } }),
  ]);
  const sp = products.filter((p) => p.variants.length).map((p) => shopifyProduct(p, root, locale, adj, variantId));
  const byId = new Map(sp.map((p) => [p.id, p]));
  const sc = collections.map((c) => shopifyCollection(c, c.products.map((x) => byId.get(x.productId)).filter((x): x is ShopifyProduct => Boolean(x)), root, locale));
  // Les références de collections des produits reçoivent leurs vrais titres.
  const colByHandle = new Map(sc.map((c) => [c.handle, c]));
  for (const p of sp) p.collections = p.collections.map((c) => { const full = colByHandle.get(c.handle); return full ? { id: full.id, title: full.title, handle: full.handle, url: full.url, image: full.image, products_count: full.products_count, description: full.description } : c; });
  return { products: sp, collections: [...sc, allCollection(sp, root, locale)], raw: products };
}

/** Données complètes d'une page pour le moteur Liquid. */
export async function buildPageData(o: BuildOpts): Promise<PageData> {
  const { store, root, locale } = o;
  const [catalog, menus, pages, posts] = await Promise.all([
    liquidCatalog(store, root, locale, o.priceAdjustBps ?? 0, o.variantId),
    resolveMenus(store, locale),
    db.page.findMany({ where: { storeId: store.id, published: true } }),
    db.blogPost.findMany({ where: { storeId: store.id, published: true }, orderBy: { publishedAt: "desc" } }),
  ]);
  const policies = readPolicies(store.policies);
  const policyList = POLICY_KEYS.filter((k) => policies[k].published && policies[k].body).map((k) => ({ title: POLICY_LABELS[k][locale], url: `${root}/policies/${k}`, handle: k, body: policies[k].body }));
  const policy = (k: string) => { const p = policyList.find((x) => x.handle === k); return p ? { title: p.title, url: p.url, body: p.body } : null; };
  const languages = storeLocales(store);
  const langs = languages.map((l) => ({ iso_code: l, name: l === "fr" ? "Français" : "English", endonym_name: l === "fr" ? "Français" : "English", primary: l === languages[0], root_url: root || "/", shop_locale: { locale: l } }));
  const currency = { iso_code: o.display?.code ?? store.currency, symbol: { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$", JPY: "¥" }[o.display?.code ?? store.currency] ?? (o.display?.code ?? store.currency), name: o.display?.code ?? store.currency };
  const domain = store.domain && store.domainVerifiedAt ? store.domain : new URL(o.origin).host;
  const shop: ShopifyShop = {
    id: store.id, name: store.name, description: store.tagline, email: "", domain, permanent_domain: domain, url: `${o.origin}${root}`, secure_url: `${o.origin}${root}`,
    currency: store.currency, money_format: moneyFormat(store.currency).format, money_with_currency_format: moneyFormat(store.currency).withCurrency,
    enabled_currencies: [{ iso_code: store.currency, symbol: currency.symbol, name: store.currency }], enabled_payment_types: ["visa", "master", "american_express", "apple_pay", "google_pay"],
    published_locales: langs, address: { address1: "", address2: "", city: "", zip: "", country: "France", country_code: "FR", province: "", summary: "", phone: "" }, phone: "",
    password_message: store.passwordMessage, products_count: catalog.products.length, collections_count: catalog.collections.length - 1, types: [...new Set(catalog.products.map((p) => p.type).filter(Boolean))], vendors: [...new Set(catalog.products.map((p) => p.vendor).filter(Boolean))],
    policies: policyList.map(({ title, url, handle, body }) => ({ title, url, handle, body })), privacy_policy: policy("privacy"), refund_policy: policy("returns"), shipping_policy: policy("shipping"), terms_of_service: policy("terms"), subscription_policy: null,
    customer_accounts_enabled: true, customer_accounts_optional: true, brand: { logo: null, square_logo: null, colors: {}, slogan: store.tagline, short_description: store.tagline }, metafields: {}, taxes_included: true, checkout: { guest_login: true },
  };
  const r = root || "";
  const routes: PageData["routes"] = {
    root_url: r || "/", account_url: `${r}/account`, account_login_url: `${r}/account/login`, account_logout_url: `${r}/account/logout`, account_register_url: `${r}/account/register`, account_addresses_url: `${r}/account/addresses`, account_recover_url: `${r}/account/recover`,
    collections_url: `${r}/collections`, all_products_collection_url: `${r}/collections/all`, search_url: `${r}/search`, predictive_search_url: `${r}/search/suggest`, cart_url: `${r}/cart`, cart_add_url: `${r}/cart/add`, cart_change_url: `${r}/cart/change`, cart_clear_url: `${r}/cart/clear`, cart_update_url: `${r}/cart/update`, product_recommendations_url: `${r}/recommendations/products`, storefront_login_url: `${r}/account/login`,
  };
  const language = langs.find((l) => l.iso_code === locale) ?? langs[0];
  const pageType = o.template === "index" ? "index" : o.template;
  const linklists: Record<string, ShopifyLinklist> = {
    "main-menu": { title: locale === "en" ? "Main menu" : "Menu principal", handle: "main-menu", levels: 2, links: links(menus.main, store.slug, root, o.path) },
    footer: { title: locale === "en" ? "Footer menu" : "Menu de pied de page", handle: "footer", levels: 1, links: links(menus.footer, store.slug, root, o.path) },
  };
  const blog = shopifyBlog(posts, root, locale);
  const pageObjects = o.pageObjects ?? {};
  const title = pageObjects.page_title ?? pageObjects.product?.title ?? pageObjects.collection?.title ?? pageObjects.page?.title ?? pageObjects.article?.title ?? (o.template === "index" ? store.name : o.template === "cart" ? (locale === "en" ? "Cart" : "Panier") : o.template === "search" ? (locale === "en" ? "Search" : "Recherche") : o.template === "404" ? (locale === "en" ? "Page not found" : "Page introuvable") : store.name);
  return {
    template: o.template, template_suffix: o.templateSuffix, shop, routes,
    request: { host: domain, origin: o.origin, path: o.path, page_type: pageType, design_mode: Boolean(o.designMode), visual_preview_mode: false, locale: language },
    localization: { language, available_languages: langs, country: { iso_code: "FR", name: "France", currency, market: { handle: "fr", id: "fr" }, unit_system: "metric", available_languages: langs }, available_countries: [{ iso_code: "FR", name: "France", currency }], market: { handle: "fr", id: "fr" } },
    cart: o.cart, customer: shopifyCustomer(o.customer), linklists, collections: catalog.collections,
    all_products: Object.fromEntries(catalog.products.slice(0, 20).map((p) => [p.handle, p])),
    pages: Object.fromEntries(pages.map((p) => [p.handle, shopifyPage(p, root, locale)])),
    blogs: { news: blog, blog: blog }, articles: Object.fromEntries(blog.articles.map((a) => [`news/${a.handle}`, a])),
    ...pageObjects,
    page_title: title, page_description: pageObjects.page_description ?? store.tagline, canonical_url: `${o.origin}${o.path}`, current_page: o.currentPage ?? 1, current_tags: null,
    content_for_header: o.contentForHeader ?? "", locale, money: { format: moneyFormat(store.currency).format, formatWithCurrency: moneyFormat(store.currency).withCurrency, currency: o.display?.code ?? store.currency, rate: o.display?.rate ?? 1 },
    design_mode: Boolean(o.designMode), form_results: o.formResults,
  };
}
