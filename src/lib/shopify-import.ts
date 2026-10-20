import { PRODUCT_COLUMNS } from "./csv";

/** Export produits de Shopify (Produits > Exporter) reconnu à ses colonnes. */
export const isShopifyCsv = (header: string[]) => header.includes("Handle") && header.includes("Variant Price");

/** Description HTML de Shopify → texte simple (paragraphes, listes « - », entités décodées). */
export function htmlToText(html: string) {
  return html
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type ShopifyImages = {
  /** Photos de chaque produit (identifiant Shopify), dans l'ordre de Shopify. */
  product: Map<string, string[]>;
  /** Photo d'une variante : « identifiant|valeurs d'options » → adresse. */
  variant: Map<string, string>;
};

/**
 * Traduit le tableau Shopify au format d'import de Revolution Ecom.
 * Les lignes qui ne portent qu'une photo supplémentaire ne créent pas de variante.
 * La variante unique « Title / Default Title » de Shopify devient un produit sans option.
 */
export function convertShopify(table: string[][]): { table: string[][]; images: ShopifyImages } {
  const header = table[0].map((h) => h.trim());
  const col = (row: string[], name: string) => { const i = header.indexOf(name); return i >= 0 ? (row[i] ?? "").trim() : ""; };
  const out: string[][] = [[...PRODUCT_COLUMNS]];
  const images: ShopifyImages = { product: new Map(), variant: new Map() };
  const names = new Map<string, string[]>(); // noms d'options du produit (donnés sur sa première ligne)

  for (const row of table.slice(1)) {
    const handle = col(row, "Handle");
    if (!handle) continue;
    const img = col(row, "Image Src");
    if (img) {
      const list = images.product.get(handle) ?? [];
      const pos = Number(col(row, "Image Position")) || list.length + 1;
      list[pos - 1] = img;
      images.product.set(handle, list);
    }
    const price = col(row, "Variant Price");
    const v1 = col(row, "Option1 Value");
    if (!price && !v1) continue; // ligne « photo seule »

    if (col(row, "Option1 Name")) names.set(handle, [col(row, "Option1 Name"), col(row, "Option2 Name"), col(row, "Option3 Name")]);
    const optNames = names.get(handle) ?? ["", "", ""];
    const single = optNames[0] === "Title" && v1 === "Default Title";
    const values = single ? ["", "", ""] : [v1, col(row, "Option2 Value"), col(row, "Option3 Value")];
    const title = col(row, "Title");
    const status = col(row, "Status").toLowerCase();
    const r: Record<string, string> = {
      Identifiant: handle,
      Titre: title,
      Description: title ? htmlToText(col(row, "Body (HTML)")) : "",
      Statut: title ? (status === "draft" || status === "archived" || col(row, "Published").toUpperCase() === "FALSE" ? "brouillon" : "actif") : "",
      Collections: title ? col(row, "Type") : "",
      "Option1 nom": single ? "" : optNames[0], "Option1 valeur": values[0],
      "Option2 nom": single ? "" : optNames[1], "Option2 valeur": optNames[1] ? values[1] : "",
      "Option3 nom": single ? "" : optNames[2], "Option3 valeur": optNames[2] ? values[2] : "",
      Prix: price,
      "Prix avant réduction": col(row, "Variant Compare At Price"),
      SKU: col(row, "Variant SKU"),
      Stock: col(row, "Variant Inventory Qty"),
      "Poids (g)": col(row, "Variant Grams"),
      // Organisation : catégorie, type, fournisseur et balises Shopify ; le code-barres de chaque variante.
      "Catégorie": title ? col(row, "Product Category") : "",
      "Type de produit": title ? col(row, "Type") : "",
      Fournisseur: title ? col(row, "Vendor") : "",
      Balises: title ? col(row, "Tags") : "",
      "Code-barres": col(row, "Variant Barcode"),
    };
    out.push(PRODUCT_COLUMNS.map((c) => r[c] ?? ""));
    const vImg = col(row, "Variant Image");
    if (vImg) images.variant.set(`${handle}|${JSON.stringify(values.filter((_, k) => optNames[k] && !single))}`, vImg);
  }
  for (const [h, list] of images.product) images.product.set(h, list.filter(Boolean));
  return { table: out, images };
}
