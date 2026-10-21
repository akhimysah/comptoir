/**
 * Jeu de données réaliste pour le moteur Liquid : 3 produits, 2 collections, un panier d'une ligne,
 * menus, pages, blog. Réutilisable par les tests et par l'aperçu de l'éditeur de thème.
 */
import type {
  PageData, ShopifyArticle, ShopifyBlog, ShopifyCart, ShopifyCollection, ShopifyImage, ShopifyLineItem, ShopifyLink, ShopifyLinklist, ShopifyLocalization, ShopifyPage, ShopifyProduct,
  ShopifyRequest, ShopifyRoutes, ShopifyShop, ShopifyVariant,
} from "@/lib/liquid/types";

const ROOT = "/s/demo/";
const ORIGIN = "https://demo.example.test";

export function sampleImage(id: string, width = 1200, height = 1500, alt = ""): ShopifyImage {
  return { id, src: `${ORIGIN}/media/${id}.jpg`, alt, width, height, aspect_ratio: Math.round((width / height) * 1000) / 1000, position: 1, media_type: "image" };
}

function variant(p: { id: string; handle: string; title: string }, i: number, opts: { title: string; price: number; compare?: number | null; available?: boolean; option1?: string | null; option2?: string | null; sku?: string }): ShopifyVariant {
  const id = `${p.id}${i}`;
  return {
    id, title: opts.title, sku: opts.sku ?? `${p.handle.toUpperCase()}-${i}`, barcode: "", price: opts.price, compare_at_price: opts.compare ?? null, available: opts.available ?? true,
    inventory_quantity: opts.available === false ? 0 : 12, inventory_management: "shopify", inventory_policy: "deny", option1: opts.option1 ?? "Default Title", option2: opts.option2 ?? null, option3: null,
    options: [opts.option1 ?? "Default Title", ...(opts.option2 ? [opts.option2] : [])], featured_image: null, image: null, weight: 500, weight_unit: "g", requires_shipping: true, taxable: true,
    url: `${ROOT}products/${p.handle}?variant=${id}`, product_id: p.id,
  };
}

export function sampleProduct(n: 1 | 2 | 3): ShopifyProduct {
  const base = [
    { id: "7001", handle: "t-shirt-coton-bio", title: "T-shirt coton bio", vendor: "Atelier Nord", type: "T-shirts", tags: ["coton", "bio", "nouveau"], price: 2900, compare: 3500, options: ["Taille", "Couleur"] },
    { id: "7002", handle: "sweat-capuche", title: "Sweat à capuche", vendor: "Atelier Nord", type: "Sweats", tags: ["hiver"], price: 6900, compare: null, options: ["Taille"] },
    { id: "7003", handle: "casquette-logo", title: "Casquette logo", vendor: "Studio Sud", type: "Accessoires", tags: ["accessoire"], price: 2500, compare: null, options: ["Title"] },
  ][n - 1];
  const img1 = sampleImage(`${base.handle}-1`, 1200, 1500, base.title);
  const img2 = sampleImage(`${base.handle}-2`, 1200, 1500, `${base.title} — dos`);
  const variants: ShopifyVariant[] =
    n === 1
      ? [
          variant(base, 1, { title: "S / Noir", price: base.price, compare: base.compare, option1: "S", option2: "Noir" }),
          variant(base, 2, { title: "M / Noir", price: base.price, compare: base.compare, option1: "M", option2: "Noir" }),
          variant(base, 3, { title: "M / Blanc", price: base.price + 200, compare: base.compare, option1: "M", option2: "Blanc", available: false }),
        ]
      : n === 2
        ? [variant(base, 1, { title: "S", price: base.price, option1: "S" }), variant(base, 2, { title: "L", price: base.price, option1: "L" })]
        : [variant(base, 1, { title: "Default Title", price: base.price })];
  const prices = variants.map((v) => v.price);
  const optionsWithValues = base.options.map((name, i) => ({ name, position: i + 1, values: [...new Set(variants.map((v) => (i === 0 ? v.option1 : v.option2) ?? ""))].filter(Boolean) }));
  const first = variants.find((v) => v.available) ?? variants[0];
  return {
    id: base.id, title: base.title, handle: base.handle, description: `<p>${base.title} — fabriqué en Europe, coupe droite, lavable à 30°.</p>`, content: `<p>${base.title} — fabriqué en Europe.</p>`,
    vendor: base.vendor, type: base.type, tags: base.tags, price: Math.min(...prices), price_min: Math.min(...prices), price_max: Math.max(...prices), price_varies: Math.min(...prices) !== Math.max(...prices),
    compare_at_price: base.compare, compare_at_price_min: base.compare ?? 0, compare_at_price_max: base.compare ?? 0, compare_at_price_varies: false, available: variants.some((v) => v.available),
    featured_image: img1, featured_media: img1, images: [img1, img2], media: [img1, img2], variants, options: base.options, options_with_values: optionsWithValues,
    options_by_name: Object.fromEntries(optionsWithValues.map((o) => [o.name, o])), has_only_default_variant: n === 3, selected_or_first_available_variant: first, selected_variant: null, first_available_variant: first,
    url: `${ROOT}products/${base.handle}`, collections: [{ id: "9001", title: "Nouveautés", handle: "frontpage", url: `${ROOT}collections/frontpage`, image: null, products_count: 3, description: "" }],
    created_at: "2026-01-15T10:00:00Z", published_at: "2026-01-15T10:00:00Z", gift_card: false, requires_selling_plan: false, template_suffix: "",
    metafields: { reviews: { rating: { value: 4.5, scale_max: 5 }, rating_count: 12 }, custom: {} }, rating: { value: 4.5, count: 12 },
  };
}

export function sampleCollection(handle: "frontpage" | "vetements", products: ShopifyProduct[]): ShopifyCollection {
  const title = handle === "frontpage" ? "Nouveautés" : "Vêtements";
  return {
    id: handle === "frontpage" ? "9001" : "9002", title, handle, url: `${ROOT}collections/${handle}`, image: sampleImage(`collection-${handle}`, 1600, 900, title), products_count: products.length,
    description: `<p>Sélection ${title.toLowerCase()} de la saison.</p>`, products, all_products_count: products.length, all_tags: [...new Set(products.flatMap((p) => p.tags))], all_types: [...new Set(products.map((p) => p.type))],
    all_vendors: [...new Set(products.map((p) => p.vendor))], sort_by: "manual", default_sort_by: "manual",
    sort_options: [{ name: "En vedette", value: "manual" }, { name: "Prix croissant", value: "price-ascending" }, { name: "Prix décroissant", value: "price-descending" }],
    current_type: null, current_vendor: null, template_suffix: "", featured_image: products[0]?.featured_image ?? null,
    filters: [{ label: "Disponibilité", param_name: "filter.v.availability", type: "list", values: [{ label: "En stock", value: "1", count: products.length, active: false, param_name: "filter.v.availability", url_to_add: `${ROOT}collections/${handle}?filter.v.availability=1`, url_to_remove: `${ROOT}collections/${handle}` }], active_values: [], url_to_remove: `${ROOT}collections/${handle}` }],
  };
}

function link(title: string, url: string, children: ShopifyLink[] = []): ShopifyLink {
  return { title, url, active: false, child_active: false, current: false, child_current: false, levels: children.length ? 1 : 0, links: children, type: "http_link", handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
}

export function sampleLinklists(): Record<string, ShopifyLinklist> {
  const main = [link("Accueil", ROOT), link("Boutique", `${ROOT}collections/all`, [link("Nouveautés", `${ROOT}collections/frontpage`), link("Vêtements", `${ROOT}collections/vetements`)]), link("Journal", `${ROOT}blogs/news`), link("Contact", `${ROOT}pages/contact`)];
  const footer = [link("À propos", `${ROOT}pages/about`), link("Contact", `${ROOT}pages/contact`), link("Recherche", `${ROOT}search`)];
  return { "main-menu": { title: "Menu principal", handle: "main-menu", levels: 2, links: main }, footer: { title: "Pied de page", handle: "footer", levels: 1, links: footer } };
}

export function sampleCart(products: ShopifyProduct[]): ShopifyCart {
  const p = products[0];
  const v = p.variants[0];
  const item: ShopifyLineItem = {
    id: v.id, key: `${v.id}:abc`, title: `${p.title} - ${v.title}`, product_title: p.title, variant_title: v.title, quantity: 2, price: v.price, line_price: v.price * 2, original_price: v.price, original_line_price: v.price * 2,
    final_price: v.price, final_line_price: v.price * 2, total_discount: 0, line_level_total_discount: 0, line_level_discount_allocations: [], discount_allocations: [], sku: v.sku, grams: 500, vendor: p.vendor, url: p.url,
    image: p.featured_image, product: p, variant: v, variant_id: v.id, product_id: p.id, handle: p.handle, properties: {}, requires_shipping: true, taxable: true, gift_card: false,
    options_with_values: [{ name: "Taille", value: "S" }, { name: "Couleur", value: "Noir" }], item_components: [], selling_plan_allocation: null, unit_price: null,
  } as ShopifyLineItem;
  return {
    token: "cart-token", note: "", attributes: {}, item_count: 2, items: [item], total_price: item.line_price, items_subtotal_price: item.line_price, original_total_price: item.line_price, total_discount: 0, total_weight: 1000,
    currency: "EUR", requires_shipping: true, taxes_included: true, empty: false, cart_level_discount_applications: [], discount_applications: [], checkout_charge_amount: item.line_price,
  };
}

export function samplePages(): Record<string, ShopifyPage> {
  return {
    about: { id: "101", title: "À propos", handle: "about", url: `${ROOT}pages/about`, content: "<p>Une petite marque indépendante.</p>", author: "Équipe", published_at: "2026-01-01T00:00:00Z", template_suffix: "" },
    contact: { id: "102", title: "Contact", handle: "contact", url: `${ROOT}pages/contact`, content: "<p>Écrivez-nous.</p>", author: "Équipe", published_at: "2026-01-01T00:00:00Z", template_suffix: "contact" },
  };
}

export function sampleBlog(): { blog: ShopifyBlog; articles: Record<string, ShopifyArticle> } {
  const mk = (n: number): ShopifyArticle => ({
    id: `30${n}`, title: `Article ${n}`, handle: `article-${n}`, url: `${ROOT}blogs/news/article-${n}`, author: "Camille", content: `<p>Contenu de l'article ${n}.</p>`, excerpt: `Résumé ${n}`, excerpt_or_content: `Résumé ${n}`,
    image: sampleImage(`article-${n}`, 1600, 900), published_at: `2026-02-0${n}T09:00:00Z`, created_at: `2026-02-0${n}T09:00:00Z`, tags: ["actu"], comments_count: 0, comments_enabled: false, moderated: true, user: { first_name: "Camille", last_name: "D.", name: "Camille D." },
  });
  const articles = [mk(1), mk(2)];
  const blog: ShopifyBlog = { id: "40", title: "Journal", handle: "news", url: `${ROOT}blogs/news`, articles, articles_count: 2, all_tags: ["actu"], tags: ["actu"], comments_enabled: false, moderated: true };
  return { blog, articles: Object.fromEntries(articles.map((a) => [`news/${a.handle}`, a])) };
}

export function sampleShop(): ShopifyShop {
  return {
    id: "1", name: "Boutique Démo", description: "Vêtements et accessoires fabriqués en Europe.", email: "bonjour@demo.example.test", domain: "demo.example.test", permanent_domain: "demo.example.test", url: ORIGIN, secure_url: ORIGIN,
    currency: "EUR", money_format: "{{amount_with_comma_separator}} €", money_with_currency_format: "{{amount_with_comma_separator}} € EUR",
    enabled_currencies: [{ iso_code: "EUR", symbol: "€", name: "Euro" }], enabled_payment_types: ["visa", "master", "paypal"],
    published_locales: [{ iso_code: "fr", name: "French", endonym_name: "Français", primary: true, root_url: ROOT }, { iso_code: "en", name: "English", endonym_name: "English", primary: false, root_url: `${ROOT}en` }],
    address: { address1: "12 rue des Lilas", address2: "", city: "Lyon", zip: "69001", country: "France", country_code: "FR", province: "", summary: "12 rue des Lilas, Lyon, France", phone: "+33 4 00 00 00 00" },
    phone: "+33 4 00 00 00 00", password_message: "Ouverture prochaine", products_count: 3, collections_count: 2, types: ["T-shirts", "Sweats", "Accessoires"], vendors: ["Atelier Nord", "Studio Sud"],
    policies: [{ title: "Politique de remboursement", url: `${ROOT}policies/refund-policy`, handle: "refund-policy", body: "<p>30 jours.</p>" }],
    privacy_policy: { title: "Confidentialité", url: `${ROOT}policies/privacy-policy`, body: "<p>Vos données.</p>" }, refund_policy: { title: "Remboursement", url: `${ROOT}policies/refund-policy`, body: "<p>30 jours.</p>" },
    shipping_policy: { title: "Livraison", url: `${ROOT}policies/shipping-policy`, body: "<p>48h.</p>" }, terms_of_service: { title: "CGV", url: `${ROOT}policies/terms-of-service`, body: "<p>CGV.</p>" }, subscription_policy: null,
    customer_accounts_enabled: true, customer_accounts_optional: true, brand: { logo: null, square_logo: null, colors: {}, slogan: "Simple et durable", short_description: "Vêtements durables" }, metafields: {}, taxes_included: true, checkout: { guest_login: true },
  };
}

export function sampleRoutes(): ShopifyRoutes {
  return {
    root_url: ROOT, account_url: `${ROOT}account`, account_login_url: `${ROOT}account/login`, account_logout_url: `${ROOT}account/logout`, account_register_url: `${ROOT}account/register`, account_addresses_url: `${ROOT}account/addresses`,
    account_recover_url: `${ROOT}account/recover`, collections_url: `${ROOT}collections`, all_products_collection_url: `${ROOT}collections/all`, search_url: `${ROOT}search`, predictive_search_url: `${ROOT}search/suggest`,
    cart_url: `${ROOT}cart`, cart_add_url: `${ROOT}cart/add`, cart_change_url: `${ROOT}cart/change`, cart_clear_url: `${ROOT}cart/clear`, cart_update_url: `${ROOT}cart/update`, product_recommendations_url: `${ROOT}recommendations/products`,
  };
}

export function sampleLocalization(): ShopifyLocalization {
  const fr = { iso_code: "fr", name: "French", endonym_name: "Français", primary: true, root_url: ROOT, shop_locale: { locale: "fr" } };
  const en = { iso_code: "en", name: "English", endonym_name: "English", primary: false, root_url: `${ROOT}en`, shop_locale: { locale: "en" } };
  const eur = { iso_code: "EUR", symbol: "€", name: "Euro" };
  return {
    language: fr, available_languages: [fr, en],
    country: { iso_code: "FR", name: "France", currency: eur, market: { handle: "fr", id: "1" }, unit_system: "metric", available_languages: [fr, en] },
    available_countries: [{ iso_code: "FR", name: "France", currency: eur }, { iso_code: "BE", name: "Belgique", currency: eur }],
    market: { handle: "fr", id: "1" },
  };
}

const PAGE_TYPE: Record<string, string> = { index: "index", product: "product", collection: "collection", "list-collections": "list-collections", cart: "cart", search: "search", page: "page", blog: "blog", article: "article", "404": "404", password: "password", "customers/login": "customers/login", "customers/register": "customers/register", "customers/account": "customers/account" };

/** Données complètes d'une page ; `overrides` est fusionné en surface (template, product, collection…). */
export function samplePageData(overrides: Partial<PageData> = {}): PageData {
  const products = [sampleProduct(1), sampleProduct(2), sampleProduct(3)];
  const frontpage = sampleCollection("frontpage", products);
  const vetements = sampleCollection("vetements", products.slice(0, 2));
  const { blog, articles } = sampleBlog();
  const template = overrides.template ?? "index";
  const pathFor: Record<string, string> = { index: ROOT, product: products[0].url, collection: frontpage.url, cart: `${ROOT}cart`, search: `${ROOT}search?q=t-shirt`, "404": `${ROOT}introuvable`, blog: blog.url, article: articles["news/article-1"].url, page: `${ROOT}pages/about`, "list-collections": `${ROOT}collections` };
  const request: ShopifyRequest = {
    host: "demo.example.test", origin: ORIGIN, path: (pathFor[template] ?? ROOT).split("?")[0], page_type: PAGE_TYPE[template] ?? template, design_mode: !!overrides.design_mode, visual_preview_mode: false,
    locale: { iso_code: "fr", name: "French", endonym_name: "Français", primary: true, root_url: ROOT, shop_locale: { locale: "fr" } },
  };
  const data: PageData = {
    template, shop: sampleShop(), routes: sampleRoutes(), request, localization: sampleLocalization(), cart: sampleCart(products), customer: null, linklists: sampleLinklists(),
    collections: [frontpage, vetements], all_products: Object.fromEntries(products.map((p) => [p.handle, p])), pages: samplePages(), blogs: { news: blog }, articles, images: {},
    product: template === "product" ? products[0] : undefined,
    collection: template === "collection" ? frontpage : undefined,
    page: template === "page" ? samplePages().about : undefined,
    blog: template === "blog" || template === "article" ? blog : undefined,
    article: template === "article" ? articles["news/article-1"] : undefined,
    search: template === "search" ? { performed: true, terms: "t-shirt", results: products.slice(0, 1), results_count: 1, types: ["product"], default_sort_by: "relevance", sort_by: "relevance", sort_options: [{ name: "Pertinence", value: "relevance" }], filters: [] } : undefined,
    recommendations: { performed: true, products: products.slice(1), products_count: 2, intent: "related" },
    predictive_search: undefined,
    page_title: template === "product" ? products[0].title : template === "collection" ? frontpage.title : "Boutique Démo",
    page_description: "Vêtements et accessoires fabriqués en Europe.", canonical_url: ORIGIN + (pathFor[template] ?? ROOT), current_page: 1, current_tags: null,
    content_for_header: "<!-- content_for_header -->", locale: "fr",
    money: { format: "{{amount_with_comma_separator}} €", formatWithCurrency: "{{amount_with_comma_separator}} € EUR", currency: "EUR", rate: 1 },
    settings: undefined, design_mode: false, form_results: {},
  };
  return { ...data, ...overrides };
}
