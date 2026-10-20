import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticate, invalid, body, joinTags, page, paged, productJson } from "@/lib/api";
import { db, textSearch } from "@/lib/db";
import { uniqueHandle } from "@/lib/handles";
import { logAdjustment } from "@/lib/inventory-log";

/** Liste des produits : ?status=active|draft, ?q=texte, pagination ?limit et ?after. */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read_products");
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const { limit, ...p } = page(url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const rows = await db.product.findMany({
    where: { storeId: auth.store.id, ...(status === "active" || status === "draft" ? { status } : {}), ...(q ? { OR: [{ title: textSearch(q) }, { vendor: textSearch(q) }, { productType: textSearch(q) }, { tags: textSearch(q) }] } : {}) },
    include: { variants: true },
    ...p,
  });
  const { data, next } = paged(rows, limit);
  return NextResponse.json({ data: data.map((x) => productJson(x, auth.store)), next });
}

const money = z.number().int().min(0).max(100_000_000);
const variantInput = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(3).optional(),
  priceCents: money,
  compareAtCents: money.nullable().optional(),
  sku: z.string().trim().max(60).optional(),
  stock: z.number().int().min(-100_000).max(1_000_000).optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).optional(),
  barcode: z.string().trim().max(40).optional(),
  /** Taille du produit emballé, en millimètres. */
  dimensionsMm: z.object({ length: z.number().int().min(0).max(5000).nullable(), width: z.number().int().min(0).max(5000).nullable(), height: z.number().int().min(0).max(5000).nullable() }).nullable().optional(),
});
const productInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).optional(),
  status: z.enum(["active", "draft"]).optional(),
  vendor: z.string().trim().max(100).optional(),
  productType: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  taxable: z.boolean().optional(),
  images: z.array(z.string().url().max(2000)).max(20).optional(),
  options: z.array(z.object({ name: z.string().trim().min(1).max(40), values: z.array(z.string().trim().min(1).max(60)).min(1).max(100) })).max(3).optional(),
  variants: z.array(variantInput).min(1).max(100),
});

/** Crée un produit avec ses variantes (brouillon par défaut). */
export async function POST(req: Request) {
  const auth = await authenticate(req, "write_products");
  if ("response" in auth) return auth.response;
  const parsed = productInput.safeParse(await body(req));
  if (!parsed.success) return invalid(parsed.error);
  const b = parsed.data;
  const options = b.options ?? [];
  for (const v of b.variants) if ((v.options ?? []).length !== options.length) return apiError(422, "invalid", "Chaque variante doit avoir une valeur par option du produit.");
  if (!options.length && b.variants.length > 1) return apiError(422, "invalid", "Plusieurs variantes demandent au moins une option (ex. « Taille »).");
  const product = await db.product.create({
    data: {
      storeId: auth.store.id, title: b.title, handle: await uniqueHandle(auth.store.id, b.title), description: b.description ?? "", status: b.status ?? "draft",
      vendor: b.vendor ?? "", productType: b.productType ?? "", category: b.category ?? "", tags: joinTags(b.tags ?? []), taxable: b.taxable ?? true,
      images: JSON.stringify(b.images ?? []), options: JSON.stringify(options),
      variants: { create: b.variants.map((v, i) => ({ title: v.title ?? (v.options?.length ? v.options.join(" / ") : "Par défaut"), optionValues: JSON.stringify(v.options ?? []), priceCents: v.priceCents, compareAtCents: v.compareAtCents ?? null, sku: v.sku ?? "", barcode: v.barcode ?? "", stock: v.stock ?? 0, weightGrams: v.weightGrams ?? 0, lengthMm: v.dimensionsMm?.length ?? null, widthMm: v.dimensionsMm?.width ?? null, heightMm: v.dimensionsMm?.height ?? null, position: i })) },
    },
    include: { variants: true },
  });
  // Stock initial tracé dans l'historique des ajustements.
  for (const v of product.variants) await logAdjustment(db, { storeId: auth.store.id, variantId: v.id, delta: v.stock, after: v.stock, reason: "API (création du produit)" });
  return NextResponse.json({ data: productJson(product, auth.store) }, { status: 201 });
}
