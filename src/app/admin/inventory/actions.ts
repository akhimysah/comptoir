"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setStock(variantId: string, stock: number): Promise<{ error?: string }> {
  const { store } = await requirePerm("products");
  const qty = Math.floor(stock);
  if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) return { error: "Quantité invalide." };
  const res = await db.variant.updateMany({ where: { id: variantId, product: { storeId: store.id } }, data: { stock: qty } });
  if (!res.count) return { error: "Variante introuvable." };
  await logActivity(`Stock modifié : ${qty} disponible(s)`, "/admin/inventory");
  revalidatePath("/admin/inventory");
  revalidatePath(`/s/${store.slug}`, "layout");
  return {};
}
