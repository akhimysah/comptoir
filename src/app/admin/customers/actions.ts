"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";

export async function saveCustomerNote(form: FormData) {
  const { store } = await requireStore();
  const id = String(form.get("id"));
  await db.customer.updateMany({ where: { id, storeId: store.id }, data: { note: String(form.get("note") ?? "").slice(0, 2000) } });
  revalidatePath(`/admin/customers/${id}`);
}
