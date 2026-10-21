/**
 * Contrat entre le moteur Liquid (rendu des thèmes Shopify importés) et le reste de l'app.
 * Les objets suivent les noms et la forme des objets Liquid de Shopify (prix en centimes, dates ISO).
 * Source de référence : https://shopify.dev/docs/api/liquid/objects
 */

/** Fichiers du thème (layout/, templates/, sections/, snippets/, config/, locales/, assets/). */
export interface ThemeSource {
  /** Identité et version du thème (clé de cache des gabarits analysés). */
  id?: string;
  version?: string;
  /** Contenu texte d'un fichier (ex. "sections/header.liquid"), ou null s'il n'existe pas. */
  get(path: string): Promise<string | null>;
  /** Chemins de fichiers commençant par un préfixe (ex. "templates/"). */
  list(prefix: string): Promise<string[]>;
  /** Adresse publique d'un fichier de assets/ (ex. "base.css" → "/s/ma-boutique/assets/base.css"). */
  assetUrl(name: string): string;
}

export type ShopifyImage = {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  aspect_ratio: number;
  /** Position (1-based) dans les images du produit. */
  position?: number;
  /** Taille maximale servie (nos images ne sont pas redimensionnées à la volée). */
  media_type?: "image";
};

export type ShopifyVariant = {
  id: string;
  title: string;
  sku: string;
  barcode: string;
  price: number;
  compare_at_price: number | null;
  available: boolean;
  inventory_quantity: number;
  inventory_management: "shopify" | null;
  inventory_policy: "deny" | "continue";
  option1: string | null;
  option2: string | null;
  option3: string | null;
  options: string[];
  featured_image: ShopifyImage | null;
  image: ShopifyImage | null;
  weight: number;
  weight_unit: string;
  requires_shipping: boolean;
  taxable: boolean;
  url: string;
  product_id: string;
};

export type ShopifyProductOption = { name: string; position: number; values: string[]; selected_value?: string };

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  content: string;
  vendor: string;
  type: string;
  tags: string[];
  price: number;
  price_min: number;
  price_max: number;
  price_varies: boolean;
  compare_at_price: number | null;
  compare_at_price_min: number;
  compare_at_price_max: number;
  compare_at_price_varies: boolean;
  available: boolean;
  featured_image: ShopifyImage | null;
  featured_media: ShopifyImage | null;
  images: ShopifyImage[];
  media: ShopifyImage[];
  variants: ShopifyVariant[];
  options: string[];
  options_with_values: ShopifyProductOption[];
  options_by_name: Record<string, ShopifyProductOption>;
  has_only_default_variant: boolean;
  selected_or_first_available_variant: ShopifyVariant | null;
  selected_variant: ShopifyVariant | null;
  first_available_variant: ShopifyVariant | null;
  url: string;
  collections: ShopifyCollectionRef[];
  created_at: string;
  published_at: string;
  gift_card: boolean;
  requires_selling_plan: boolean;
  template_suffix: string;
  metafields: Record<string, Record<string, unknown>>;
  rating?: { value: number; count: number } | null;
};

export type ShopifyCollectionRef = { id: string; title: string; handle: string; url: string; image: ShopifyImage | null; products_count: number; description: string };

export type ShopifyCollection = ShopifyCollectionRef & {
  products: ShopifyProduct[];
  all_products_count: number;
  all_tags: string[];
  all_types: string[];
  all_vendors: string[];
  sort_by: string;
  default_sort_by: string;
  sort_options: { name: string; value: string }[];
  current_type: string | null;
  current_vendor: string | null;
  template_suffix: string;
  featured_image: ShopifyImage | null;
  filters: ShopifyFilter[];
};

export type ShopifyFilter = {
  label: string;
  param_name: string;
  type: "list" | "price_range" | "boolean";
  values: { label: string; value: string; count: number; active: boolean; param_name: string; url_to_add: string; url_to_remove: string }[];
  active_values: { label: string; value: string; count: number; active: boolean; param_name: string; url_to_add: string; url_to_remove: string }[];
  min_value?: { param_name: string; value: number | null };
  max_value?: { param_name: string; value: number | null };
  range_max?: number;
  url_to_remove: string;
  operator?: "AND" | "OR";
  presentation?: "text" | "swatch" | "image";
};

export type ShopifyLineItem = {
  id: string;
  key: string;
  title: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  line_price: number;
  original_price: number;
  original_line_price: number;
  final_price: number;
  final_line_price: number;
  total_discount: number;
  line_level_total_discount: number;
  line_level_discount_allocations: { amount: number; discount_application: { title: string } }[];
  discount_allocations: { amount: number; discount_application: { title: string } }[];
  sku: string;
  grams: number;
  vendor: string;
  url: string;
  image: ShopifyImage | null;
  product: ShopifyProduct;
  variant: ShopifyVariant;
  variant_id: string;
  product_id: string;
  handle: string;
  properties: Record<string, string>;
  requires_shipping: boolean;
  taxable: boolean;
  gift_card: boolean;
  options_with_values: { name: string; value: string }[];
  item_components?: unknown[];
  selling_plan_allocation?: null;
  unit_price?: null;
};

export type ShopifyCart = {
  token: string;
  note: string;
  attributes: Record<string, string>;
  item_count: number;
  items: ShopifyLineItem[];
  total_price: number;
  items_subtotal_price: number;
  original_total_price: number;
  total_discount: number;
  total_weight: number;
  currency: string;
  requires_shipping: boolean;
  taxes_included: boolean;
  empty: boolean;
  cart_level_discount_applications: { title: string; total_allocated_amount: number }[];
  discount_applications?: { title: string; total_allocated_amount: number; target_type: string; type: string }[];
  checkout_charge_amount?: number;
};

export type ShopifyLink = { title: string; url: string; active: boolean; child_active: boolean; current: boolean; child_current: boolean; levels: number; links: ShopifyLink[]; type: string; handle: string; object?: unknown };
export type ShopifyLinklist = { title: string; handle: string; levels: number; links: ShopifyLink[] };

export type ShopifyArticle = { id: string; title: string; handle: string; url: string; author: string; content: string; excerpt: string; excerpt_or_content: string; image: ShopifyImage | null; published_at: string; created_at: string; tags: string[]; comments_count: number; comments_enabled?: boolean; moderated?: boolean; user: { first_name: string; last_name: string; name: string } };
export type ShopifyBlog = { id: string; title: string; handle: string; url: string; articles: ShopifyArticle[]; articles_count: number; all_tags: string[]; tags: string[]; comments_enabled: boolean; moderated: boolean };
export type ShopifyPage = { id: string; title: string; handle: string; url: string; content: string; author: string; published_at: string; template_suffix: string };

export type ShopifyAddress = { id: string | null; first_name: string; last_name: string; name: string; company: string; address1: string; address2: string; city: string; zip: string; province: string; province_code: string; country: string; country_code: string; country_name: string; phone: string; summary: string; url: string; street: string };

export type ShopifyOrder = {
  id: string; name: string; order_number: number; order_status_url: string; customer_url: string; email: string; phone: string; note: string; created_at: string; cancelled: boolean; cancelled_at: string | null; cancel_reason: string | null;
  financial_status: string; financial_status_label: string; fulfillment_status: string; fulfillment_status_label: string;
  subtotal_price: number; line_items_subtotal_price: number; total_duties: number; taxes_included: boolean; shipping_price: number; total_shipping_price: number; tax_price: number; total_tax: number; total_discounts: number; total_price: number; total_refunded_amount: number; total_net_amount: number; currency: string;
  line_items: ShopifyLineItem[]; item_count: number; shipping_address: ShopifyAddress | null; billing_address: ShopifyAddress | null; shipping_methods: { title: string; price: number }[]; discount_applications: { title: string; total_allocated_amount: number }[]; tax_lines: { title: string; price: number; rate: number; rate_percentage: number }[]; transactions: { amount: number; kind: string; status: string; gateway: string; created_at: string }[]; tags: string[]; attributes: Record<string, string>; fulfillments: { tracking_company: string; tracking_number: string; tracking_url: string; created_at: string }[];
};

export type ShopifyCustomer = {
  id: string; email: string; name: string; first_name: string; last_name: string; accepts_marketing: boolean; email_marketing_consent?: { state: string }; orders_count: number; total_spent: number; tags: string[]; has_account: boolean; phone: string;
  default_address: ShopifyAddress | null; addresses: ShopifyAddress[]; addresses_count: number; new_address?: ShopifyAddress; orders: ShopifyOrder[]; last_order: ShopifyOrder | null; b2b?: boolean; tax_exempt?: boolean; current_company?: null; company_available_locations?: never[];
} | null;

export type ShopifyShop = {
  id: string;
  name: string;
  description: string;
  email: string;
  domain: string;
  permanent_domain: string;
  url: string;
  secure_url: string;
  currency: string;
  money_format: string;
  money_with_currency_format: string;
  enabled_currencies: { iso_code: string; symbol: string; name: string }[];
  enabled_payment_types: string[];
  published_locales: { iso_code: string; name: string; endonym_name: string; primary: boolean; root_url: string }[];
  address: { address1: string; address2: string; city: string; zip: string; country: string; country_code: string; province: string; summary: string; phone: string };
  phone: string;
  password_message: string;
  products_count: number;
  collections_count: number;
  types: string[];
  vendors: string[];
  policies: { title: string; url: string; handle: string; body: string }[];
  privacy_policy: { title: string; url: string; body: string } | null;
  refund_policy: { title: string; url: string; body: string } | null;
  shipping_policy: { title: string; url: string; body: string } | null;
  terms_of_service: { title: string; url: string; body: string } | null;
  subscription_policy: null;
  customer_accounts_enabled: boolean;
  customer_accounts_optional: boolean;
  brand: { logo: ShopifyImage | null; square_logo: ShopifyImage | null; colors: Record<string, unknown>; slogan: string; short_description: string } | null;
  metafields: Record<string, Record<string, unknown>>;
  taxes_included: boolean;
  checkout?: { guest_login?: boolean };
};

/** Adresses des pages, préfixées par la racine de la boutique (/s/<boutique> ou / sur un domaine). */
export type ShopifyRoutes = {
  root_url: string;
  account_url: string;
  account_login_url: string;
  account_logout_url: string;
  account_register_url: string;
  account_addresses_url: string;
  account_recover_url: string;
  collections_url: string;
  all_products_collection_url: string;
  search_url: string;
  predictive_search_url: string;
  cart_url: string;
  cart_add_url: string;
  cart_change_url: string;
  cart_clear_url: string;
  cart_update_url: string;
  product_recommendations_url: string;
  storefront_login_url?: string;
};

export type ShopifyLocalization = {
  language: { iso_code: string; name: string; endonym_name: string; primary: boolean; root_url: string; shop_locale: { locale: string } };
  available_languages: { iso_code: string; name: string; endonym_name: string; primary: boolean; root_url: string }[];
  country: { iso_code: string; name: string; currency: { iso_code: string; symbol: string; name: string }; market: { handle: string; id: string }; unit_system: string; available_languages: unknown[] };
  available_countries: { iso_code: string; name: string; currency: { iso_code: string; symbol: string; name: string } }[];
  market: { handle: string; id: string };
};

export type ShopifyRequest = {
  host: string;
  origin: string;
  path: string;
  page_type: string; // index | product | collection | list-collections | cart | search | page | blog | article | 404 | password | customers/login …
  design_mode: boolean;
  visual_preview_mode: boolean;
  locale: { iso_code: string; name: string; endonym_name: string; primary: boolean; root_url: string; shop_locale: { locale: string } };
};

export type ShopifySearch = { performed: boolean; terms: string; results: (ShopifyProduct | ShopifyArticle | ShopifyPage)[]; results_count: number; types: string[]; default_sort_by: string; sort_by: string; sort_options: { name: string; value: string }[]; filters: ShopifyFilter[] };

export type ShopifyPaginate = { current_page: number; current_offset: number; items: number; page_size: number; pages: number; parts: { title: string; url: string; is_link: boolean }[]; next: { title: string; url: string; is_link: boolean } | null; previous: { title: string; url: string; is_link: boolean } | null; page_param: string };

/** Données d'une page, préparées par l'app (src/lib/liquid/data.ts) et consommées par le moteur. */
export type PageData = {
  template: "index" | "product" | "collection" | "list-collections" | "cart" | "search" | "page" | "blog" | "article" | "404" | "password" | "gift_card" | "customers/login" | "customers/register" | "customers/account" | "customers/order" | "customers/addresses" | "customers/activate_account" | "customers/reset_password";
  /** Suffixe de gabarit (product.json vs product.alt.json). */
  template_suffix?: string;
  shop: ShopifyShop;
  routes: ShopifyRoutes;
  request: ShopifyRequest;
  localization: ShopifyLocalization;
  cart: ShopifyCart;
  customer: ShopifyCustomer;
  linklists: Record<string, ShopifyLinklist>;
  /** Toutes les collections (collections.all, collections['handle'], boucle for). */
  collections: ShopifyCollection[];
  /** Produits accessibles par handle (all_products['handle']) : au plus 20, comme Shopify. */
  all_products: Record<string, ShopifyProduct>;
  pages: Record<string, ShopifyPage>;
  blogs: Record<string, ShopifyBlog>;
  articles?: Record<string, ShopifyArticle>;
  images?: Record<string, ShopifyImage>;
  /** Objets propres à la page (product, collection, article, blog, page, search, recommendations…). */
  product?: ShopifyProduct;
  collection?: ShopifyCollection;
  page?: ShopifyPage;
  blog?: ShopifyBlog;
  article?: ShopifyArticle;
  search?: ShopifySearch;
  recommendations?: { performed: boolean; products: ShopifyProduct[]; products_count: number; intent: string };
  predictive_search?: { performed: boolean; terms: string; resources: { products: ShopifyProduct[]; collections: ShopifyCollectionRef[]; pages: ShopifyPage[]; articles: ShopifyArticle[]; queries: { text: string; styled_text: string; url: string }[] } };
  page_title: string;
  page_description: string;
  canonical_url: string;
  current_page: number;
  current_tags: string[] | null;
  /** HTML injecté par {{ content_for_header }} (mesure d'audience, aperçu…). */
  content_for_header: string;
  /** Traductions du marchand pour les textes du thème (locales/<langue>.json), fusionnées par le moteur avec celles du thème. */
  locale: string;
  /** Formatage des prix : symbole et format. */
  money: { format: string; formatWithCurrency: string; currency: string; rate: number };
  /** Paramètres du thème en vigueur (config/settings_data.json « current », éventuellement modifiés par le marchand). */
  settings?: Record<string, unknown>;
  /** Mode éditeur de thème : contours et attributs de sections. */
  design_mode?: boolean;
  /** Commande affichée (customers/order) et adresse en cours de modification (customers/addresses). */
  order?: ShopifyOrder;
  address?: ShopifyAddress;
  /** Balises <option> des pays livrables pour les formulaires d'adresse ({{ all_country_option_tags }}). */
  country_option_tags?: string;
  /** Paramètres de la requête courante (filtres, tri) conservés par la pagination. */
  request_query?: string;
  /** Message d'erreur / succès des formulaires (contact, newsletter, login…), par type de formulaire. */
  form_results?: Record<string, { posted_successfully: boolean; errors: string[]; fields: Record<string, string> }>;
};

/** Résultat du rendu d'une page. */
export type RenderResult = { html: string; status?: number; headers?: Record<string, string> };
