"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { splitTags } from "@/lib/segments";

export async function saveCustomerNote(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  await db.customer.updateMany({ where: { id, storeId: store.id }, data: { note: String(form.get("note") ?? "").slice(0, 2000) } });
  revalidatePath(`/admin/customers/${id}`);
}

export async function adjustPoints(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const delta = Math.trunc(Number(form.get("points")));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 100) || "Ajustement manuel";
  const c = await db.customer.findFirst({ where: { id, storeId: store.id } });
  if (!c || !delta) return;
  const next = Math.max(0, c.points + delta);
  await db.$transaction([
    db.customer.update({ where: { id: c.id }, data: { points: next } }),
    db.loyaltyEntry.create({ data: { storeId: store.id, customerId: c.id, points: next - c.points, reason } }),
  ]);
  revalidatePath(`/admin/customers/${id}`);
}

export async function saveCustomerTags(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const tags = splitTags(String(form.get("tags") ?? "")).map((t) => t.slice(0, 30)).slice(0, 20).join(", ");
  await db.customer.updateMany({ where: { id, storeId: store.id }, data: { tags } });
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
}
