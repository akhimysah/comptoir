"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setReviewStatus(form: FormData) {
  const { store } = await requirePerm("products");
  const status = String(form.get("status"));
  if (!["published", "hidden", "pending"].includes(status)) return;
  await db.review.updateMany({ where: { id: String(form.get("id")), storeId: store.id }, data: { status } });
  revalidatePath("/admin/reviews");
  revalidatePath(`/s/${store.slug}`, "layout");
}

export async function deleteReview(form: FormData) {
  const { store } = await requirePerm("products");
  await db.review.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/reviews");
  revalidatePath(`/s/${store.slug}`, "layout");
}
