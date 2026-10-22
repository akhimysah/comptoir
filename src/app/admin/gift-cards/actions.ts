"use server";

import { logActivity } from "@/lib/activity";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { giftCardEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";
import { parseMoney } from "@/lib/money";

// Sans 0/O ni 1/I, pour éviter les confusions à la lecture.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export type GiftState = { error?: string; code?: string; emailed?: string } | undefined;

export async function createGiftCard(_: GiftState, form: FormData): Promise<GiftState> {
  const { store } = await requirePerm("products");
  const amount = parseMoney(String(form.get("amount") ?? ""));
  if (!amount || amount < 100) return { error: "Indiquez un montant d'au moins 1,00." };
  if (amount > 1_000_000) return { error: "Montant trop élevé." };
  const emailRaw = String(form.get("email") ?? "").trim().toLowerCase();
  if (emailRaw && !z.string().email().safeParse(emailRaw).success) return { error: "L'adresse e-mail n'est pas valide." };
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  const exp = String(form.get("expiresAt") ?? "");
  const expiresAt = exp ? new Date(`${exp}T23:59:59`) : null;

  let code = newCode();
  for (let i = 0; i < 5 && (await db.giftCard.findUnique({ where: { storeId_code: { storeId: store.id, code } } })); i++) code = newCode();
  const card = await db.giftCard.create({ data: { storeId: store.id, code, initialCents: amount, balanceCents: amount, email: emailRaw, note, expiresAt } });
  if (emailRaw) await sendMail({ to: emailRaw, storeId: store.id, ...giftCardEmail(store, code, amount, note, expiresAt, "fr", card.id) });
  await logActivity(`Carte cadeau de ${(amount / 100).toFixed(2).replace(".", ",")} créée${emailRaw ? ` pour ${emailRaw}` : ""}`, "/admin/gift-cards");
  revalidatePath("/admin/gift-cards");
  return { code, emailed: emailRaw || undefined };
}

export async function toggleGiftCard(form: FormData) {
  const { store } = await requirePerm("products");
  const card = await db.giftCard.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (card) await db.giftCard.update({ where: { id: card.id }, data: { disabled: !card.disabled } });
  revalidatePath("/admin/gift-cards");
}
