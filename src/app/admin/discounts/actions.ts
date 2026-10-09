"use server";

import { logActivity } from "@/lib/activity";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";

const schema = z.object({
  method: z.enum(["code", "automatic"]),
  code: z.string().trim().toUpperCase().optional().default(""),
  title: z.string().trim().max(60).optional().default(""),
  type: z.enum(["percent", "fixed", "free_shipping"]),
  value: z.string(),
  minSubtotal: z.string(),
  usageLimit: z.string(),
  endsAt: z.string(),
});

export async function createDiscount(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requirePerm("discounts");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.method === "code" && !/^[A-Z0-9_-]{3,30}$/.test(d.code)) return { error: "Le code doit faire 3 à 30 caractères : lettres, chiffres, - ou _." };
  if (d.method === "automatic" && !d.title) return { error: "Donnez un nom à la remise automatique (affiché au client)." };
  const code = d.method === "code" ? d.code : `AUTO-${Date.now().toString(36).toUpperCase()}`;

  let value: number | null;
  if (d.type === "free_shipping") value = 0;
  else if (d.type === "percent") {
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
      data: { storeId: store.id, code, automatic: d.method === "automatic", title: d.title, type: d.type, value, minSubtotalCents: parseMoney(d.minSubtotal) ?? 0, usageLimit: limit, endsAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `Le code ${code} existe déjà.` };
    throw e;
  }
  await logActivity(d.method === "automatic" ? `Remise automatique « ${d.title} » créée` : `Code promo ${code} créé`, "/admin/discounts");
  revalidatePath("/admin/discounts");
  return { ok: true };
}

export async function toggleDiscount(form: FormData) {
  const { store } = await requirePerm("discounts");
  const d = await db.discount.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (d) await db.discount.update({ where: { id: d.id }, data: { active: !d.active } });
  revalidatePath("/admin/discounts");
}

export async function deleteDiscount(form: FormData) {
  const { store } = await requirePerm("discounts");
  await db.discount.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/discounts");
}
