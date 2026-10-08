"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { isImageUrl } from "@/lib/images";
import { themeSchema } from "@/lib/theme";

export async function saveTheme(json: string): Promise<{ error?: string; ok?: boolean }> {
  const { store } = await requireStore();
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { error: "Thème illisible." }; }
  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) return { error: `Thème invalide : ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}` };
  for (const s of parsed.data.sections) {
    if ("image" in s && s.image && !isImageUrl(s.image)) return { error: "Une image du thème n'est pas valide." };
  }
  await db.store.update({ where: { id: store.id }, data: { theme: JSON.stringify(parsed.data), themeUpdatedAt: new Date() } });
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/admin");
  return { ok: true };
}
