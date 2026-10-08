"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Le code doit faire 3 à 30 caractères : lettres, chiffres, - ou _."),
  type: z.enum(["percent", "fixed"]),
  value: z.string(),
  minSubtotal: z.string(),
  usageLimit: z.string(),
  endsAt: z.string(),
});

export async function createDiscount(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireStore();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  let value: number | null;
  if (d.type === "percent") {
    const n = Math.round(Number(d.value.replace(",", ".")));
    value = n >= 1 && n <= 100 ? n : null;
    if (value === null) return { error: "Le pourcentage doit être entre 1 et 100." };
  } else {
    value = parseMoney(d.value);
    if (!value) return { error: "Indiquez un montant de réduction." };
  }
  const limit = d.usageLimit ? Math.floor(Number(d.usageLimit)) : null;
  if (limit !== null && !(limit > 0)) return { error: "Le nombre d'utilisations doit être positif." };
  const endsAt = d.endsAt ? new Date(`${d.endsAt}T23:59:59`) : null;

  try {
    await db.discount.create({
      data: { storeId: store.id, code: d.code, type: d.type, value, minSubtotalCents: parseMoney(d.minSubtotal) ?? 0, usageLimit: limit, endsAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `Le code ${d.code} existe déjà.` };
    throw e;
  }
  revalidatePath("/admin/discounts");
  return { ok: true };
}

export async function toggleDiscount(form: FormData) {
  const { store } = await requireStore();
  const d = await db.discount.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (d) await db.discount.update({ where: { id: d.id }, data: { active: !d.active } });
  revalidatePath("/admin/discounts");
}

export async function deleteDiscount(form: FormData) {
  const { store } = await requireStore();
  await db.discount.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/discounts");
}
