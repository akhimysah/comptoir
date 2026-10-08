"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { defaultTheme } from "@/lib/theme";
import { slugify } from "@/lib/utils";

export type AuthState = { error?: string } | undefined;

const RESERVED = new Set(["admin", "api", "login", "signup", "app", "www"]);

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = RESERVED.has(base) ? `${base}-boutique` : base;
  for (let i = 2; await db.store.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Indiquez votre nom.").max(80),
  email: z.string().trim().toLowerCase().email("Cette adresse e-mail n'est pas valide."),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères.").max(200),
  storeName: z.string().trim().min(2, "Donnez un nom à votre boutique.").max(60),
});

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password, storeName } = parsed.data;

  if (await db.user.findUnique({ where: { email } })) return { error: "Un compte existe déjà avec cette adresse. Connectez-vous." };

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      stores: { create: { name: storeName, slug: await uniqueSlug(storeName), theme: JSON.stringify(defaultTheme(storeName)) } },
    },
  });
  await createSession(user.id);
  redirect("/admin?welcome=1");
}

const createStoreSchema = z.object({ storeName: signupSchema.shape.storeName });

/** Pour un compte connecté qui n'a pas encore de boutique. */
export async function createStore(_: AuthState, form: FormData): Promise<AuthState> {
  const user = await getUser();
  if (!user) redirect("/login");
  const parsed = createStoreSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { storeName } = parsed.data;
  await db.store.create({ data: { ownerId: user.id, name: storeName, slug: await uniqueSlug(storeName), theme: JSON.stringify(defaultTheme(storeName)) } });
  redirect("/admin?welcome=1");
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "E-mail ou mot de passe incorrect." };
  await createSession(user.id);
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
