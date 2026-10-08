"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setStock(variantId: string, stock: number): Promise<{ error?: string }> {
  const { store } = await requireStore();
  const qty = Math.floor(stock);
  if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) return { error: "Quantité invalide." };
  const res = await db.variant.updateMany({ where: { id: variantId, product: { storeId: store.id } }, data: { stock: qty } });
  if (!res.count) return { error: "Variante introuvable." };
  revalidatePath("/admin/inventory");
  revalidatePath(`/s/${store.slug}`, "layout");
  return {};
}
