import "server-only";
import type { BlogPost, Collection, Customer, MetafieldDefinition, Order, OrderItem, Page, Product, Store, Variant } from "@prisma/client";
import { orderNumber } from "../checkout-settings";
import { COUNTRIES } from "../countries";
import { db } from "../db";
import { POLICY_KEYS, POLICY_LABELS, readPolicies } from "../checkout-settings";
import { translate, type Locale } from "../i18n";
import { storeLocales } from "../locale";
import { adjustPrice, marketCountries } from "../markets";
import { MetafieldDrop } from "./drops";
import { commentsMode, publishedComments } from "../comments";
import type { Market } from "@prisma/client";
import { ALPHA2_TO_NAME } from "../geo";
import { storeCurrencies } from "../currency";
import { resolveMenus, type ResolvedLink } from "../navigation";
import { parseJson } from "../utils";
import type { PageData, ShopifyAddress, ShopifyOrder, ShopifyArticle, ShopifyComment, ShopifyBlog, ShopifyCart, ShopifyCollection, ShopifyCollectionRef, ShopifyCustomer, ShopifyImage, ShopifyLink, ShopifyLinklist, ShopifyPage, ShopifyProduct, ShopifyShop, ShopifyVariant } from "./types";

/** Produit de la base avec ses variantes et ses collections. */
export type FullProduct = Product & { variants: Variant[]; collections: { collection: Pick<Collection, "handle"> }[] };

const DEFAULT_TITLES = new Set(["Par défaut", "Default Title", "Default"]);
const handleize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Nos images n'ont pas de dimensions connues : un carré par défaut, les thèmes s'en servent pour les ratios. */
export const image = (src: string | null | undefined, alt = "", id = "", position?: number): ShopifyImage | null =>
  src ? { id: id || src, src, alt, width: 1200, height: 1200, aspect_ratio: 1, position, media_type: "image" } : null;

/**
 * Métachamps au format Shopify : `product.metafields.custom.<clé>` s'affiche comme sa valeur et expose
 * .value, .type, .namespace, .key (les thèmes écrivent indifféremment `{{ mf }}` ou `{{ mf.value }}`).
 */
type MetafieldDefLite = Pick<MetafieldDefinition, "key" | "type" | "unit">;
const SHOPIFY_METAFIELD_TYPE: Record<string, string> = { text: "single_line_text_field", multiline: "multi_line_text_field", number: "number_decimal", boolean: "boolean", choice: "single_line_text_field" };
export function metafieldObjects(raw: string, defs: MetafieldDefLite[]) {
  const values = parseJson<Record<string, unknown>>(raw, {});
  const custom: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === "") continue;
    const def = defs.find((d) => d.key === key);
    const type = SHOPIFY_METAFIELD_TYPE[def?.type ?? "text"] ?? "single_line_text_field";
    const value: unknown = def?.type === "number" ? Number(v) : def?.type === "boolean" ? v === "true" || v === true : String(v);
    const text = def?.type === "boolean" ? (value ? "true" : "false") : `${value}${def?.unit && def.type === "number" ? ` ${def.unit}` : ""}`;
    custom[key] = new MetafieldDrop(value, type, "custom", key, text);
  }
  return { custom };
}

/** Produit au format Shopify. `adj` : ajustement de prix du marché (points de base). */
export function shopifyProduct(p: FullProduct, root: string, locale: Locale, adj = 0, selectedVariantId?: string | null, defs: MetafieldDefLite[] = []): ShopifyProduct {
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
    created_at: p.createdAt.toISOString(), published_at: p.createdAt.toISOString(), gift_card: p.isGiftCard, requires_selling_plan: false, template_suffix: "", metafields: metafieldObjects(p.metafields, defs),
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

/** Adresse d'un client ou d'une commande (JSON { line1, line2?, zip, city, country, phone?, company?, firstName?, lastName? }). */
export function shopifyAddress(raw: string | null | undefined, root: string, fallbackName = "", id: string | null = "default"): ShopifyAddress | null {
  const a = parseJson<Record<string, string>>(raw, {});
  if (!a.line1 && !a.city && !a.country) return null;
  const [first, ...rest] = (fallbackName || "").split(" ");
  const first_name = a.firstName ?? first ?? "", last_name = a.lastName ?? rest.join(" ");
  const parts = [a.line1, a.line2, [a.zip, a.city].filter(Boolean).join(" "), a.country].filter(Boolean);
  return { id, first_name, last_name, name: [first_name, last_name].filter(Boolean).join(" "), company: a.company ?? "", address1: a.line1 ?? "", address2: a.line2 ?? "", city: a.city ?? "", zip: a.zip ?? "", province: "", province_code: "", country: a.country ?? "", country_code: "", country_name: a.country ?? "", phone: a.phone ?? "", summary: parts.join(", "), url: `${root}/account/addresses/${id ?? "new"}`, street: [a.line1, a.line2].filter(Boolean).join(", ") };
}

const FINANCIAL: Record<string, { fr: string; en: string }> = { paid: { fr: "Payée", en: "Paid" }, pending: { fr: "En attente", en: "Pending" }, unpaid: { fr: "Non payée", en: "Unpaid" }, refunded: { fr: "Remboursée", en: "Refunded" }, partially_refunded: { fr: "Partiellement remboursée", en: "Partially refunded" }, voided: { fr: "Annulée", en: "Voided" } };
const FULFILLMENT: Record<string, { fr: string; en: string }> = { fulfilled: { fr: "Expédiée", en: "Fulfilled" }, unfulfilled: { fr: "Non expédiée", en: "Unfulfilled" }, partial: { fr: "Partiellement expédiée", en: "Partially fulfilled" }, delivered: { fr: "Livrée", en: "Delivered" } };

/** Commande au format Shopify (customers/account, customers/order). */
export function shopifyOrder(o: Order & { items: OrderItem[] }, store: Store, root: string, locale: Locale): ShopifyOrder {
  const lab = (map: Record<string, { fr: string; en: string }>, k: string) => map[k]?.[locale === "en" ? "en" : "fr"] ?? k;
  const financial = o.cancelledAt ? "voided" : o.paymentStatus;
  const fulfillment = o.deliveredAt ? "delivered" : o.fulfillmentStatus;
  const address = shopifyAddress(o.address, root, o.name, null);
  const line_items = o.items.map((i) => {
    const img = image(i.image, i.productTitle, i.id);
    const variant = { id: i.variantId ?? i.id, title: i.variantTitle, sku: "", barcode: "", price: i.priceCents, compare_at_price: null, available: true, inventory_quantity: 0, inventory_management: null, inventory_policy: "deny" as const, option1: i.variantTitle, option2: null, option3: null, options: [i.variantTitle], featured_image: img, image: img, weight: 0, weight_unit: "kg", requires_shipping: !i.isGiftCard, taxable: true, url: "", product_id: "" };
    const product = { id: "", title: i.productTitle, handle: "", description: "", content: "", vendor: "", type: "", tags: [], price: i.priceCents, price_min: i.priceCents, price_max: i.priceCents, price_varies: false, compare_at_price: null, compare_at_price_min: 0, compare_at_price_max: 0, compare_at_price_varies: false, available: true, featured_image: img, featured_media: img, images: img ? [img] : [], media: img ? [img] : [], variants: [variant], options: ["Title"], options_with_values: [], options_by_name: {}, has_only_default_variant: true, selected_or_first_available_variant: variant, selected_variant: null, first_available_variant: variant, url: "", collections: [], created_at: "", published_at: "", gift_card: i.isGiftCard, requires_selling_plan: false, template_suffix: "", metafields: {} };
    const q = i.quantity - i.refundedQuantity;
    return { id: i.id, key: i.id, title: i.variantTitle && !["Par défaut", "Default Title"].includes(i.variantTitle) ? `${i.productTitle} - ${i.variantTitle}` : i.productTitle, product_title: i.productTitle, variant_title: ["Par défaut", "Default Title"].includes(i.variantTitle) ? null : i.variantTitle, quantity: q, price: i.priceCents, line_price: i.priceCents * q, original_price: i.priceCents, original_line_price: i.priceCents * q, final_price: i.priceCents, final_line_price: i.priceCents * q, total_discount: 0, line_level_total_discount: 0, line_level_discount_allocations: [], discount_allocations: [], sku: "", grams: 0, vendor: "", url: "", image: img, product, variant, variant_id: variant.id, product_id: "", handle: "", properties: {}, requires_shipping: !i.isGiftCard, taxable: true, gift_card: i.isGiftCard, options_with_values: [], item_components: [], selling_plan_allocation: null, unit_price: null };
  });
  const name = orderNumber(store, o.number);
  return {
    id: o.id, name, order_number: o.number, order_status_url: `${root}/order/${o.id}`, customer_url: `${root}/account/orders/${o.id}`, email: o.email, phone: "", note: o.note, created_at: o.createdAt.toISOString(), cancelled: Boolean(o.cancelledAt), cancelled_at: o.cancelledAt?.toISOString() ?? null, cancel_reason: null,
    financial_status: financial, financial_status_label: lab(FINANCIAL, financial), fulfillment_status: fulfillment, fulfillment_status_label: lab(FULFILLMENT, fulfillment),
    subtotal_price: o.subtotalCents, line_items_subtotal_price: o.subtotalCents, total_duties: 0, taxes_included: true, shipping_price: o.shippingCents, total_shipping_price: o.shippingCents, tax_price: o.taxCents, total_tax: o.taxCents, total_discounts: o.discountCents + o.giftCardCents + o.storeCreditCents, total_price: o.totalCents, total_refunded_amount: o.refundedCents, total_net_amount: o.totalCents - o.refundedCents, currency: store.currency,
    line_items, item_count: line_items.reduce((n, l) => n + l.quantity, 0), shipping_address: address, billing_address: address, shipping_methods: o.shippingMethod ? [{ title: o.shippingMethod, price: o.shippingCents }] : [], discount_applications: o.discountCode ? [{ title: o.discountCode, total_allocated_amount: o.discountCents }] : [], tax_lines: o.taxCents ? [{ title: "TVA", price: o.taxCents, rate: o.taxRateBps / 10000, rate_percentage: o.taxRateBps / 100 }] : [], transactions: o.paidAt ? [{ amount: o.totalCents, kind: "sale", status: "success", gateway: o.paymentMethod, created_at: o.paidAt.toISOString() }] : [], tags: o.tags.split(",").map((x) => x.trim()).filter(Boolean), attributes: {}, fulfillments: o.fulfilledAt ? [{ tracking_company: o.trackingCarrier, tracking_number: o.trackingNumber, tracking_url: o.trackingUrl, created_at: o.fulfilledAt.toISOString() }] : [],
  };
}

export function shopifyCustomer(c: Customer | null, root = "", orders: ShopifyOrder[] = []): ShopifyCustomer {
  if (!c) return null;
  const [first_name, ...rest] = c.name.split(" ");
  const address = shopifyAddress(c.address, root, c.name);
  const empty: ShopifyAddress = { id: null, first_name, last_name: rest.join(" "), name: c.name, company: c.company, address1: "", address2: "", city: "", zip: "", province: "", province_code: "", country: "", country_code: "", country_name: "", phone: c.phone ?? "", summary: "", url: `${root}/account/addresses/new`, street: "" };
  return { id: c.id, email: c.email, name: c.name, first_name, last_name: rest.join(" "), accepts_marketing: c.acceptsMarketing, email_marketing_consent: { state: c.acceptsMarketing ? "subscribed" : "not_subscribed" }, orders_count: orders.length, total_spent: orders.reduce((n, o) => n + o.total_net_amount, 0), tags: c.tags.split(",").map((x) => x.trim()).filter(Boolean), has_account: true, phone: c.phone ?? "", default_address: address, addresses: address ? [address] : [], addresses_count: address ? 1 : 0, new_address: empty, orders, last_order: orders[0] ?? null, tax_exempt: c.taxExempt, b2b: Boolean(c.company) };
}

/** Commandes d'un client, les plus récentes d'abord. */
export async function customerOrders(store: Store, customerId: string, root: string, locale: Locale) {
  const rows = await db.order.findMany({ where: { storeId: store.id, customerId }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((o) => shopifyOrder(o, store, root, locale));
}

/** <option> des pays livrables, pour {{ all_country_option_tags }} des formulaires d'adresse. */
export const countryOptionTags = (selected = "") => COUNTRIES.map((c) => `<option value="${c}" data-provinces="[]"${c === selected ? " selected" : ""}>${c}</option>`).join("");

const MONEY: Record<string, { format: string; withCurrency: string }> = {
  EUR: { format: "{{amount_with_comma_separator}} €", withCurrency: "{{amount_with_comma_separator}} € EUR" },
  CHF: { format: "CHF {{amount_with_apostrophe_separator}}", withCurrency: "CHF {{amount_with_apostrophe_separator}}" },
  GBP: { format: "£{{amount}}", withCurrency: "£{{amount}} GBP" },
  USD: { format: "${{amount}}", withCurrency: "${{amount}} USD" },
  CAD: { format: "${{amount}}", withCurrency: "${{amount}} CAD" },
  JPY: { format: "¥{{amount_no_decimals}}", withCurrency: "¥{{amount_no_decimals}} JPY" },
};
export const moneyFormat = (currency: string) => MONEY[currency] ?? { format: `{{amount_with_comma_separator}} ${currency}`, withCurrency: `{{amount_with_comma_separator}} ${currency}` };

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$", MAD: "MAD", XOF: "CFA", DZD: "DA", TND: "DT", AED: "AED", SAR: "SAR", JPY: "¥" };
const CURRENCY_NAME: Record<string, { fr: string; en: string }> = { EUR: { fr: "Euro", en: "Euro" }, USD: { fr: "Dollar américain", en: "US Dollar" }, GBP: { fr: "Livre sterling", en: "British Pound" }, CHF: { fr: "Franc suisse", en: "Swiss Franc" }, CAD: { fr: "Dollar canadien", en: "Canadian Dollar" }, MAD: { fr: "Dirham marocain", en: "Moroccan Dirham" }, XOF: { fr: "Franc CFA", en: "CFA Franc" }, DZD: { fr: "Dinar algérien", en: "Algerian Dinar" }, TND: { fr: "Dinar tunisien", en: "Tunisian Dinar" }, AED: { fr: "Dirham des Émirats", en: "UAE Dirham" }, SAR: { fr: "Riyal saoudien", en: "Saudi Riyal" }, JPY: { fr: "Yen", en: "Japanese Yen" } };
export const NAME_TO_ALPHA2: Record<string, string> = Object.fromEntries(Object.entries(ALPHA2_TO_NAME).map(([k, v]) => [v, k]));

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
  /** Marchés de la boutique et marché du visiteur (sélecteur pays / devise des thèmes). */
  markets?: Market[];
  market?: Market | null;
  /** Identifiant de variante demandé (?variant=). */
  variantId?: string | null;
  currentPage?: number;
  formResults?: PageData["form_results"];
  pageObjects?: Partial<Pick<PageData, "product" | "collection" | "page" | "blog" | "article" | "search" | "recommendations" | "predictive_search" | "page_title" | "page_description" | "order" | "address">>;
};

/** Catalogue complet de la boutique au format Shopify (produits actifs et collections), chargé une fois par requête. */
export async function liquidCatalog(store: Store, root: string, locale: Locale, adj = 0, variantId?: string | null) {
  const [products, collections, ratings, defs] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: "active" }, include: { variants: true, collections: { include: { collection: { select: { handle: true } } } } }, orderBy: { createdAt: "desc" } }),
    db.collection.findMany({ where: { storeId: store.id }, include: { products: { select: { productId: true } } }, orderBy: { title: "asc" } }),
    db.review.groupBy({ by: ["productId"], where: { storeId: store.id, status: "published" }, _avg: { rating: true }, _count: true }),
    db.metafieldDefinition.findMany({ where: { storeId: store.id }, select: { key: true, type: true, unit: true } }),
  ]);
  const sp = products.filter((p) => p.variants.length).map((p) => shopifyProduct(p, root, locale, adj, variantId, defs));
  // Avis publiés → métachamps « reviews » que les thèmes lisent (product.metafields.reviews.rating.value.rating, rating_count).
  for (const r of ratings) {
    const p = sp.find((x) => x.id === r.productId);
    if (!p) continue;
    const avg = Math.round((r._avg.rating ?? 0) * 10) / 10;
    p.rating = { value: avg, count: r._count };
    p.metafields.reviews = { rating: { value: { rating: avg, scale_min: 1, scale_max: 5 } }, rating_count: { value: r._count } };
  }
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
  const [catalog, menus, pages, posts, media] = await Promise.all([
    liquidCatalog(store, root, locale, o.priceAdjustBps ?? 0, o.variantId),
    resolveMenus(store, locale),
    db.page.findMany({ where: { storeId: store.id, published: true } }),
    db.blogPost.findMany({ where: { storeId: store.id, published: true }, orderBy: { publishedAt: "desc" } }),
    db.mediaFile.findMany({ where: { storeId: store.id }, select: { url: true, name: true, alt: true, width: true, height: true } }),
  ]);
  // Images choisies dans l'éditeur (Contenu › Fichiers) : accessibles par leur adresse, avec leurs vraies dimensions.
  const images: Record<string, ShopifyImage> = {};
  for (const m of media) { const w = m.width || 1600, h = m.height || 1600; images[m.url] = { id: m.url, src: m.url, alt: m.alt || m.name, width: w, height: h, aspect_ratio: Math.round((w / h) * 1000) / 1000, media_type: "image" }; }
  // Photos de produits : leurs vraies dimensions quand elles viennent de la bibliothèque.
  const fix = (i: ShopifyImage | null) => { if (!i) return i; const m = images[i.src]; if (m) { i.width = m.width; i.height = m.height; i.aspect_ratio = m.aspect_ratio; } return i; };
  for (const p of catalog.products) { p.images.forEach(fix); p.variants.forEach((v) => fix(v.featured_image)); fix(p.featured_image); }
  for (const c of catalog.collections) fix(c.image);
  const policies = readPolicies(store.policies);
  const policyList = POLICY_KEYS.filter((k) => policies[k].published && policies[k].body).map((k) => ({ title: POLICY_LABELS[k][locale], url: `${root}/policies/${k}`, handle: k, body: policies[k].body }));
  const policy = (k: string) => { const p = policyList.find((x) => x.handle === k); return p ? { title: p.title, url: p.url, body: p.body } : null; };
  const languages = storeLocales(store);
  const langs = languages.map((l) => ({ iso_code: l, name: l === "fr" ? "Français" : "English", endonym_name: l === "fr" ? "Français" : "English", primary: l === languages[0], root_url: root || "/", shop_locale: { locale: l } }));
  const currencyObj = (code: string) => ({ iso_code: code, symbol: CURRENCY_SYMBOL[code] ?? code, name: CURRENCY_NAME[code]?.[locale === "en" ? "en" : "fr"] ?? code });
  const currency = currencyObj(o.display?.code ?? store.currency);
  // Pays proposés par le sélecteur : ceux des marchés (avec leur devise), puis les autres pays livrables avec la devise de la boutique.
  const shown = new Set(storeCurrencies(store).map((c) => c.code));
  const marketCurrency = (m: Market | null | undefined) => (m?.currency && shown.has(m.currency) ? m.currency : store.currency);
  const countryEntry = (name: string, m: Market | null) => ({ iso_code: NAME_TO_ALPHA2[name] ?? name.slice(0, 2).toUpperCase(), name, currency: currencyObj(marketCurrency(m)), market: { handle: m ? handleize(m.name) : "default", id: m?.id ?? "default" }, unit_system: "metric", available_languages: [] as never[] });
  const marketsList = o.markets ?? [];
  const inMarket = new Set(marketsList.flatMap((m) => marketCountries(m)));
  const available_countries = [...marketsList.flatMap((m) => marketCountries(m).map((c) => countryEntry(c, m))), ...COUNTRIES.filter((c) => !inMarket.has(c)).map((c) => countryEntry(c, null))];
  const currentCountryName = o.market ? marketCountries(o.market)[0] ?? "France" : "France";
  const country = { ...countryEntry(currentCountryName, o.market ?? null), currency, available_languages: [] as never[] };
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
  const mainLinks = links(menus.main, store.slug, root, o.path), footerLinks = links(menus.footer, store.slug, root, o.path);
  const linklists: Record<string, ShopifyLinklist> = {
    "main-menu": { title: locale === "en" ? "Main menu" : "Menu principal", handle: "main-menu", levels: 2, links: mainLinks },
    footer: { title: locale === "en" ? "Footer menu" : "Menu de pied de page", handle: "footer", levels: 1, links: footerLinks },
  };
  // Menus créés par le marchand, par identifiant ; alias courants des thèmes vers nos menus de base.
  for (const [handle, m] of Object.entries(menus.extra)) linklists[handle] = { title: m.title, handle, levels: 2, links: links(m.links, store.slug, root, o.path) };
  for (const alias of ["footer-menu", "quick-links", "footer-1"]) linklists[alias] ??= linklists.footer;
  linklists["customer-account-main-menu"] ??= linklists["main-menu"];
  const blog = shopifyBlog(posts, root, locale);
  const pageObjects = o.pageObjects ?? {};
  const title = pageObjects.page_title ?? pageObjects.product?.title ?? pageObjects.collection?.title ?? pageObjects.page?.title ?? pageObjects.article?.title ?? (o.template === "index" ? store.name : o.template === "cart" ? (locale === "en" ? "Cart" : "Panier") : o.template === "search" ? (locale === "en" ? "Search" : "Recherche") : o.template === "404" ? (locale === "en" ? "Page not found" : "Page introuvable") : store.name);
  return {
    template: o.template, template_suffix: o.templateSuffix, shop, routes,
    request: { host: domain, origin: o.origin, path: o.path, page_type: pageType, design_mode: Boolean(o.designMode), visual_preview_mode: false, locale: language },
    localization: { language, available_languages: langs, country: { ...country, available_languages: langs }, available_countries, market: country.market },
    cart: o.cart, customer: await (async () => (o.customer ? shopifyCustomer(o.customer, root, await customerOrders(store, o.customer.id, root, locale)) : null))(), linklists, collections: catalog.collections,
    all_products: Object.fromEntries(catalog.products.slice(0, 20).map((p) => [p.handle, p])),
    pages: Object.fromEntries(pages.map((p) => [p.handle, shopifyPage(p, root, locale)])),
    images, blogs: { news: blog, blog: blog }, articles: Object.fromEntries(blog.articles.map((a) => [`news/${a.handle}`, a])),
    ...pageObjects,
    page_title: title, page_description: pageObjects.page_description ?? store.tagline, canonical_url: `${o.origin}${o.path}`, current_page: o.currentPage ?? 1, current_tags: null,
    // Les prix s'affichent au format de la devise choisie par le visiteur (symbole et séparateurs), convertis au taux du jour.
    content_for_header: o.contentForHeader ?? "", locale, money: { format: moneyFormat(o.display?.code ?? store.currency).format, formatWithCurrency: moneyFormat(o.display?.code ?? store.currency).withCurrency, currency: o.display?.code ?? store.currency, rate: o.display?.rate ?? 1 },
    design_mode: Boolean(o.designMode), form_results: o.formResults, country_option_tags: countryOptionTags(),
  };
}

/** Article avec ses commentaires publiés et le réglage de la boutique (page d'article). */
export async function articleWithComments(a: ShopifyArticle, postId: string, store: Store): Promise<ShopifyArticle> {
  const mode = commentsMode(store);
  const rows = mode === "off" ? [] : await publishedComments(postId);
  const comments: ShopifyComment[] = rows.map((c) => ({ id: c.id, author: c.author, email: c.email, content: c.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"), status: c.status, created_at: c.createdAt.toISOString(), updated_at: c.createdAt.toISOString(), url: `${a.url}#comment-${c.id}` }));
  return { ...a, comments, comments_count: comments.length, comments_enabled: mode !== "off", moderated: mode === "moderated", comment_post_url: `${a.url}/comments` };
}
