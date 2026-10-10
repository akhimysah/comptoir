"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { importCustomers, readCustomerTable } from "@/lib/customer-import";

export type CustomerImportResult = { created: number; updated: number; subscribed: number; errors: string[]; shopify: boolean } | { error: string } | undefined;

export async function importCustomersAction(_: CustomerImportResult, form: FormData): Promise<CustomerImportResult> {
  const { store } = await requirePerm("customers");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > 10 * 1024 * 1024) return { error: "Le fichier dépasse 10 Mo." };
  const table = parseCsv(await file.text());
  if (table.length > 20001) return { error: "20 000 clients maximum par import." };
  const read = readCustomerTable(table);
  if ("error" in read) return read;
  const res = await importCustomers(store.id, read.rows);
  await logActivity(`Import ${read.shopify ? "Shopify" : "CSV"} : ${res.created} client(s) créé(s), ${res.updated} mis à jour`, "/admin/customers");
  revalidatePath("/admin/customers");
  return { ...res, shopify: read.shopify };
}
