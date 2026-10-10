import { requirePerm } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { CUSTOMER_COLUMNS } from "@/lib/customer-import";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";

export async function GET() {
  const { store } = await requirePerm("customers");
  const customers = await db.customer.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } });
  const rows: string[][] = [[...CUSTOMER_COLUMNS]];
  for (const c of customers) {
    const a = parseJson<{ line1?: string; zip?: string; city?: string; country?: string }>(c.address, {});
    rows.push([c.name, c.email, c.acceptsMarketing ? "oui" : "non", c.tags, c.note, c.phone, a.line1 ?? "", a.zip ?? "", a.city ?? "", a.country ?? ""]);
  }
  return csvResponse(toCsv(rows), `clients-${store.slug}.csv`);
}
