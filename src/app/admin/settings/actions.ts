"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "MAD"] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Le nom doit faire au moins 2 caractères.").max(60),
  tagline: z.string().trim().max(200),
  currency: z.enum(CURRENCIES),
  shipping: z.string(),
  freeFrom: z.string(),
});

export async function saveSettings(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  const shippingCents = parseMoney(s.shipping);
  const freeShippingFromCents = parseMoney(s.freeFrom || "0");
  if (shippingCents === null) return { error: "Indiquez des frais de livraison valides (0 pour gratuit)." };
  if (freeShippingFromCents === null) return { error: "Le seuil de livraison offerte n'est pas valide." };
  await db.store.update({ where: { id: store.id }, data: { name: s.name, tagline: s.tagline, currency: s.currency, shippingCents, freeShippingFromCents } });
  revalidatePath("/admin", "layout");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ok: true };
}
