"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearLimit, clientIp, hit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/utils";
import { clearChallenge, currentChallenge, startChallenge, verifySecondFactor } from "@/lib/two-factor";
import { defaultTheme } from "@/lib/theme";
import { slugify } from "@/lib/utils";

const DUMMY_HASH = "$2a$12$LRNI5jXnNXHBdTdjOeDWEuHqzmygNFTNZtD.BT/aNit.FWuhT08Q2";

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
  const ip = await clientIp();
  // 10 essais par adresse e-mail et 30 par appareil, par quart d'heure.
  const allowed = (await hit(`login:email:${email}`, 10, 15 * 60_000)) && (await hit(`login:ip:${ip}`, 30, 15 * 60_000));
  if (!allowed) return { error: "Trop de tentatives. Réessayez dans 15 minutes ou réinitialisez votre mot de passe." };
  const user = await db.user.findUnique({ where: { email } });
  // Même temps de réponse que le compte existe ou non.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "E-mail ou mot de passe incorrect." };
  await clearLimit(`login:email:${email}`);
  const next = safeNext(String(form.get("next") ?? ""), "/admin");
  // Double authentification : le mot de passe ne suffit pas, on demande le code de l'application.
  if (user.totpEnabled) {
    await startChallenge(user.id, next);
    redirect("/login/2fa");
  }
  await createSession(user.id);
  redirect(next);
}

export async function logout(form?: FormData) {
  await destroySession();
  redirect(safeNext(String(form?.get("next") ?? ""), "/"));
}

export async function verifyTwoFactor(_: AuthState, form: FormData): Promise<AuthState> {
  const c = await currentChallenge();
  if (!c) redirect("/login?expired=1");
  // 5 essais par connexion en attente, puis il faut ressaisir le mot de passe.
  const counted = await db.loginChallenge.updateMany({ where: { id: c.id, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
  if (!counted.count) { await clearChallenge(c.id); redirect("/login?expired=1"); }
  const kind = await verifySecondFactor(c.userId, String(form.get("code") ?? ""));
  if (!kind) return { error: "Code incorrect. Vérifiez l'heure de votre téléphone, ou utilisez un code de secours." };
  await clearChallenge(c.id);
  await createSession(c.userId);
  redirect(kind === "recovery" ? "/admin/account?recovery=1" : c.next);
}
