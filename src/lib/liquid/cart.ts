import "server-only";
import { randomBytes } from "crypto";
import type { Store } from "@prisma/client";
import { priceCart, type PricedCart } from "../pricing";
import type { ShopifyCart, ShopifyLineItem } from "./types";

/**
 * Panier des thèmes Shopify : côté serveur, dans un cookie (les thèmes appellent /cart.js, /cart/add.js…
 * comme sur Shopify). Le panier natif de l'app vit dans le navigateur ; /checkout fait le pont entre les deux.
 */
export type CookieLine = { v: string; q: number; p?: Record<string, string> };
export const cartCookie = (storeId: string) => `lc_${storeId}`;
const MAX_LINES = 50;

export function readCartCookie(cookie: string | null, storeId: string): CookieLine[] {
  const raw = cookie?.match(new RegExp(`(?:^|;\\s*)${cartCookie(storeId)}=([^;]+)`))?.[1];
  if (!raw) return [];
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as CookieLine[];
    return Array.isArray(v) ? v.filter((l) => l && typeof l.v === "string" && Number.isInteger(l.q) && l.q > 0).slice(0, MAX_LINES) : [];
  } catch { return []; }
}
export function cartCookieHeader(storeId: string, lines: CookieLine[]) {
  const value = encodeURIComponent(JSON.stringify(lines.filter((l) => l.q > 0).slice(0, MAX_LINES)));
  return `${cartCookie(storeId)}=${value}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax`;
}

/** Clé de ligne Shopify : identifiant de variante + empreinte des propriétés. */
export const lineKey = (l: CookieLine) => `${l.v}:${l.p && Object.keys(l.p).length ? Buffer.from(JSON.stringify(l.p)).toString("base64url").slice(0, 16) : "0"}`;

/** Panier au format Shopify (/cart.js et objet Liquid `cart`), prix calculés par le moteur de tarification de l'app. */
export async function shopifyCart(store: Store, lines: CookieLine[], root: string, opts: { country?: string | null; priceAdjustBps?: number; locale?: "fr" | "en" } = {}): Promise<{ cart: ShopifyCart; priced: PricedCart; lines: CookieLine[] }> {
  const priced = await priceCart(store, lines.map((l) => ({ variantId: l.v, quantity: l.q })), null, { country: opts.country ?? null }, null, { priceAdjustBps: opts.priceAdjustBps ?? 0, locale: opts.locale ?? "fr" });
  // Lignes retirées ou réduites par la tarification (stock, produit retiré) : le cookie suit.
  const kept: CookieLine[] = [];
  const items: ShopifyLineItem[] = [];
  for (const l of lines) {
    const pl = priced.lines.find((x) => x.variantId === l.v);
    if (!pl) continue;
    const q = Math.min(l.q, pl.quantity);
    if (q <= 0) continue;
    kept.push({ ...l, q });
    const image = pl.image ? { id: pl.variantId, src: pl.image, alt: pl.productTitle, width: 1200, height: 1200, aspect_ratio: 1 } : null;
    const url = `${root}/products/${pl.productHandle}?variant=${pl.variantId}`;
    const variant = { id: pl.variantId, title: pl.variantTitle, sku: "", barcode: "", price: pl.priceCents, compare_at_price: pl.compareAtCents, available: pl.available > 0, inventory_quantity: pl.available, inventory_management: "shopify" as const, inventory_policy: "deny" as const, option1: pl.variantTitle, option2: null, option3: null, options: [pl.variantTitle], featured_image: image, image, weight: 0, weight_unit: "kg", requires_shipping: !pl.isGiftCard, taxable: pl.taxable !== false, url, product_id: pl.productId };
    const product = { id: pl.productId, title: pl.productTitle, handle: pl.productHandle, description: "", content: "", vendor: "", type: "", tags: [], price: pl.priceCents, price_min: pl.priceCents, price_max: pl.priceCents, price_varies: false, compare_at_price: pl.compareAtCents, compare_at_price_min: pl.compareAtCents ?? 0, compare_at_price_max: pl.compareAtCents ?? 0, compare_at_price_varies: false, available: true, featured_image: image, featured_media: image, images: image ? [image] : [], media: image ? [image] : [], variants: [variant], options: ["Title"], options_with_values: [{ name: "Title", position: 1, values: [pl.variantTitle] }], options_by_name: {}, has_only_default_variant: pl.variantTitle === "Par défaut" || pl.variantTitle === "Default Title", selected_or_first_available_variant: variant, selected_variant: variant, first_available_variant: variant, url: `${root}/products/${pl.productHandle}`, collections: [], created_at: "", published_at: "", gift_card: pl.isGiftCard, requires_selling_plan: false, template_suffix: "", metafields: {} };
    const compare = pl.compareAtCents && pl.compareAtCents > pl.priceCents ? pl.compareAtCents : pl.priceCents;
    items.push({
      id: pl.variantId, key: lineKey(l), title: pl.variantTitle && !product.has_only_default_variant ? `${pl.productTitle} - ${pl.variantTitle}` : pl.productTitle, product_title: pl.productTitle, variant_title: product.has_only_default_variant ? null : pl.variantTitle, quantity: q,
      price: pl.priceCents, line_price: pl.priceCents * q, original_price: compare, original_line_price: compare * q, final_price: pl.priceCents, final_line_price: pl.priceCents * q,
      total_discount: 0, line_level_total_discount: 0, line_level_discount_allocations: [], discount_allocations: [], sku: "", grams: 0, vendor: "", url, image, product, variant, variant_id: pl.variantId, product_id: pl.productId, handle: pl.productHandle,
      properties: l.p ?? {}, requires_shipping: !pl.isGiftCard, taxable: pl.taxable !== false, gift_card: pl.isGiftCard, options_with_values: product.has_only_default_variant ? [] : [{ name: "Title", value: pl.variantTitle }], item_components: [], selling_plan_allocation: null, unit_price: null,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.final_line_price, 0);
  const cart: ShopifyCart = {
    token: randomBytes(8).toString("hex"), note: "", attributes: {}, item_count: items.reduce((s, i) => s + i.quantity, 0), items,
    total_price: Math.max(0, subtotal - priced.discountCents), items_subtotal_price: subtotal, original_total_price: items.reduce((s, i) => s + i.original_line_price, 0), total_discount: priced.discountCents, total_weight: priced.weightGrams ?? 0,
    currency: store.currency, requires_shipping: items.some((i) => i.requires_shipping), taxes_included: true, empty: !items.length, cart_level_discount_applications: priced.discountCents ? [{ title: priced.discountCode ?? "Remise", total_allocated_amount: priced.discountCents }] : [], discount_applications: [], checkout_charge_amount: Math.max(0, subtotal - priced.discountCents),
  };
  return { cart, priced, lines: kept };
}
