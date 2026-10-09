import { requirePerm } from "@/lib/auth";
import { csvResponse, PRODUCT_COLUMNS, toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { centsToInput } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export async function GET() {
  const { store } = await requirePerm("products");
  const products = await db.product.findMany({
    where: { storeId: store.id },
    include: { variants: { orderBy: { position: "asc" } }, collections: { include: { collection: true } } },
    orderBy: { title: "asc" },
  });
  const rows: (string | number | null)[][] = [[...PRODUCT_COLUMNS]];
  for (const p of products) {
    const options = parseJson<{ name: string }[]>(p.options, []);
    p.variants.forEach((v, i) => {
      const values = parseJson<string[]>(v.optionValues, []);
      const opt = (k: number) => [options[k]?.name ?? "", values[k] ?? ""];
      rows.push([
        p.handle,
        i === 0 ? p.title : "",
        i === 0 ? p.description : "",
        i === 0 ? (p.status === "active" ? "actif" : "brouillon") : "",
        i === 0 ? p.collections.map((c) => c.collection.title).join(", ") : "",
        ...opt(0), ...opt(1), ...opt(2),
        centsToInput(v.priceCents).replace(".", ","),
        v.compareAtCents ? centsToInput(v.compareAtCents).replace(".", ",") : "",
        v.sku,
        v.stock,
      ]);
    });
  }
  return csvResponse(toCsv(rows), `produits-${store.slug}.csv`);
}
