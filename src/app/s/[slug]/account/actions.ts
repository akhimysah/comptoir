"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createLoginCode, getCustomer, logoutCustomer, verifyLoginCode } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { loginCodeEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";

async function storeOf(slug: string) {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) throw new Error("Boutique introuvable.");
  return store;
}

export async function requestCode(slug: string, emailRaw: string): Promise<{ error?: string }> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(emailRaw);
  if (!parsed.success) return { error: "Indiquez une adresse e-mail valide." };
  const store = await storeOf(slug);
  const recent = await db.customerLoginCode.findFirst({ where: { storeId: store.id, email: parsed.data, createdAt: { gt: new Date(Date.now() - 30_000) } } });
  if (recent) return { error: "Un code vient d'être envoyé. Patientez 30 secondes avant d'en demander un autre." };
  const code = await createLoginCode(store.id, parsed.data);
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") console.log(`[compte client] Code pour ${parsed.data} sur ${store.name} : ${code}`);
  await sendMail({ to: parsed.data, storeId: store.id, ...loginCodeEmail(store, code) });
  return {};
}

export async function confirmCode(slug: string, email: string, code: string): Promise<{ error?: string }> {
  const store = await storeOf(slug);
  const res = await verifyLoginCode(store.id, slug, email.trim().toLowerCase(), code);
  if (res.error) return res;
  redirect(`/s/${slug}/account`);
}

export async function logout(form: FormData) {
  const slug = String(form.get("slug"));
  const store = await storeOf(slug);
  await logoutCustomer(store.id, slug);
  redirect(`/s/${slug}`);
}

export async function updateName(form: FormData) {
  const slug = String(form.get("slug"));
  const store = await storeOf(slug);
  const customer = await getCustomer(store.id);
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (customer && name) await db.customer.update({ where: { id: customer.id }, data: { name } });
  redirect(`/s/${slug}/account?saved=1`);
}
