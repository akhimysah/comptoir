import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProduct } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";
import { db } from "@/lib/db";
import { bundleChoicesFor } from "@/lib/bundle-choices";
import { centsToInput, formatMoney } from "@/lib/money";
import { parseJson } from "@/lib/utils";
import { storeBase } from "@/lib/domains";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("products");
  const product = await db.product.findFirst({ where: { id, storeId: store.id }, include: { variants: { orderBy: { position: "asc" } }, collections: true } });
  if (!product) notFound();
  const bundleParts = await db.bundleItem.findMany({ where: { bundleId: product.id } });
  const choices = await bundleChoicesFor(store.id, product.id);
  const collections = await db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  const productChoices = await db.product.findMany({ where: { storeId: store.id, isGiftCard: false, status: { not: "archived" } }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  const fieldDefs = await db.metafieldDefinition.findMany({ where: { storeId: store.id, owner: "product" }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const waiting = await db.stockAlert.count({ where: { storeId: store.id, notifiedAt: null, variantId: { in: product.variants.map((v) => v.id) } } });
  const sales = await productSales(store.id, product.variants.map((v) => v.id));
  const mmToCm = (mm: number | null) => (mm === null ? "" : String(mm / 10).replace(".", ","));

  return (
    <>
      <PageHeader
        back="/admin/products"
        title={product.title}
        subtitle={saved ? <span className="font-[550] text-[#0c5132]">Produit enregistré</span> : undefined}
        actions={
          <>
            {product.status === "active" && <Link href={`/s/${store.slug}/p/${product.handle}`} target="_blank" className="btn">Aperçu</Link>}
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ConfirmSubmit label="Supprimer" confirmLabel="Confirmer la suppression" />
            </form>
          </>
        }
      />
      {sales.units > 0 && (
        <p className="card mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-[13px]">
          <span className="font-[650]">{sales.units} unité{sales.units > 1 ? "s" : ""} vendue{sales.units > 1 ? "s" : ""}</span>
          <span className="text-muted">·</span>
          <span>{sales.buyers} acheteur{sales.buyers > 1 ? "s" : ""}</span>
          <span className="text-muted">·</span>
          <span>{formatMoney(sales.netCents, store.currency)} de ventes nettes</span>
          <Link href="/admin/analytics" className="ml-auto text-pine hover:underline">Afficher les détails</Link>
        </p>
      )}
      {waiting > 0 && (
        <p className="card mb-4 flex flex-wrap items-center gap-2 px-4 py-3 text-[13px]">
          <span className="rounded-md bg-[#ffeb78] px-1.5 font-[650] text-[#4f4700]">{waiting}</span>
          client{waiting > 1 ? "s attendent" : " attend"} le retour en stock de ce produit. Ils seront prévenus par e-mail dès que vous remettrez du stock.
        </p>
      )}
      <ProductForm
        key={product.updatedAt.toISOString()}
        currency={store.currency}
        collections={collections}
        storeUrl={`${storeBase(store)}`}
        bundleChoices={choices}
        fieldDefs={fieldDefs}
        productChoices={productChoices}
        handle={product.handle}
        initial={{
          id: product.id,
          seoTitle: product.seoTitle,
          isGiftCard: product.isGiftCard,
          continueSelling: product.continueSelling,
          subscriptionInterval: (product.subscriptionInterval ?? "") as "" | "week" | "month",
          subscriptionDiscountPct: product.subscriptionDiscountBps / 100,
          bundle: bundleParts.map((b) => ({ variantId: b.variantId, quantity: b.quantity })),
          seoDescription: product.seoDescription,
          metafields: parseJson<Record<string, string>>(product.metafields, {}),
          complementaryIds: parseJson<string[]>(product.complementaryIds, []),
          title: product.title,
          description: product.description,
          status: product.status as "draft" | "active",
          hue: product.hue,
          images: parseJson(product.images, []),
          options: parseJson(product.options, []),
          variants: product.variants.map((v) => ({ id: v.id, optionValues: parseJson(v.optionValues, []), price: centsToInput(v.priceCents), compareAt: centsToInput(v.compareAtCents), cost: v.costCents === null ? "" : centsToInput(v.costCents), image: v.image, weight: v.weightGrams ? String(v.weightGrams / 1000).replace(".", ",") : "", sku: v.sku, barcode: v.barcode, lengthCm: mmToCm(v.lengthMm), widthCm: mmToCm(v.widthMm), heightCm: mmToCm(v.heightMm), stock: v.stock })),
          collectionIds: product.collections.map((c) => c.collectionId),
          category: product.category,
          productType: product.productType,
          vendor: product.vendor,
          tags: product.tags.split(",").map((t) => t.trim()).filter(Boolean),
          taxable: product.taxable,
        }}
      />
    </>
  );
}

/**
 * Ventes du produit, comme le bandeau « 21 unités vendues · 21 acheteurs · 573,79 € de ventes nettes » de Shopify.
 * Base : les lignes des commandes payées (ou partiellement remboursées) et non annulées qui portent une variante du produit.
 * - unités vendues = somme des quantités commandées ;
 * - acheteurs = nombre d'adresses e-mail distinctes ;
 * - ventes nettes = Σ prix × quantité − Σ prix × quantité remboursée (hors livraison et taxes ; la remise de commande n'est pas répartie).
 */
async function productSales(storeId: string, variantIds: string[]) {
  const items = await db.orderItem.findMany({
    where: { variantId: { in: variantIds }, order: { storeId, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null } },
    select: { quantity: true, refundedQuantity: true, priceCents: true, order: { select: { email: true } } },
  });
  return {
    units: items.reduce((s, i) => s + i.quantity, 0),
    buyers: new Set(items.map((i) => i.order.email.toLowerCase())).size,
    netCents: items.reduce((s, i) => s + i.priceCents * (i.quantity - Math.min(i.quantity, i.refundedQuantity)), 0),
  };
}
