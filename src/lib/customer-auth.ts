import "server-only";
import { createHash, randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const cookieName = (storeId: string) => `cs_${storeId}`;

export async function createLoginCode(storeId: string, email: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.customerLoginCode.deleteMany({ where: { storeId, email } });
  await db.customerLoginCode.create({ data: { storeId, email, codeHash: hash(`${storeId}:${email}:${code}`), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  return code;
}

/**
 * Vérifie le code (5 essais maximum) et ouvre une session de 30 jours sur cette boutique.
 * Cookie sur tout le site (son nom est propre à la boutique) : le panier (/api/cart) doit connaître le client pour ses prix pro.
 */
export async function verifyLoginCode(storeId: string, slug: string, email: string, code: string): Promise<{ error?: string }> {
  const row = await db.customerLoginCode.findFirst({ where: { storeId, email }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt < new Date()) return { error: "Ce code a expiré. Demandez-en un nouveau." };
  // L'essai est compté avant la vérification, de façon atomique : des essais simultanés ne dépassent pas 5.
  const counted = await db.customerLoginCode.updateMany({ where: { id: row.id, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
  if (!counted.count) return { error: "Trop d'essais. Demandez un nouveau code." };
  if (row.codeHash !== hash(`${storeId}:${email}:${code.replace(/\D/g, "")}`)) return { error: "Code incorrect." };
  const used = await db.customerLoginCode.deleteMany({ where: { id: row.id } });
  if (!used.count) return { error: "Ce code a déjà été utilisé. Demandez-en un nouveau." };
  const customer = await db.customer.upsert({ where: { storeId_email: { storeId, email } }, update: {}, create: { storeId, email, name: email.split("@")[0] } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 86400_000);
  await db.customerSession.create({ data: { id: hash(token), customerId: customer.id, storeId, expiresAt } });
  (await cookies()).set(cookieName(storeId), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  return {};
}

export async function getCustomer(storeId: string) {
  const token = (await cookies()).get(cookieName(storeId))?.value;
  if (!token) return null;
  const session = await db.customerSession.findUnique({ where: { id: hash(token) } });
  if (!session || session.storeId !== storeId || session.expiresAt < new Date()) return null;
  return db.customer.findUnique({ where: { id: session.customerId } });
}

export async function logoutCustomer(storeId: string, slug: string) {
  const jar = await cookies();
  const token = jar.get(cookieName(storeId))?.value;
  if (token) await db.customerSession.deleteMany({ where: { id: hash(token) } });
  // Les anciennes sessions étaient limitées à /s/slug : les deux sont effacées.
  jar.set(cookieName(storeId), "", { path: "/", maxAge: 0 });
  jar.set(cookieName(storeId), "", { path: `/s/${slug}`, maxAge: 0 });
}

/* ------------------------------------------------------------------ Comptes avec mot de passe (thèmes Shopify) */

import bcrypt from "bcryptjs";
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Z0bN9iQ5kK6bQ8fS1Qm1D9Z4yVj6C"; // comparaison à durée constante quand le compte n'existe pas

/** Ouvre une session de 30 jours pour ce client (cookie sur tout le site, nom propre à la boutique). */
export async function openCustomerSession(storeId: string, customerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 86400_000);
  await db.customerSession.create({ data: { id: hash(token), customerId, storeId, expiresAt } });
  (await cookies()).set(cookieName(storeId), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

const PASSWORD_MIN = 8;
export const passwordProblem = (p: string, locale: "fr" | "en" = "fr") => (p.length < PASSWORD_MIN ? (locale === "en" ? `Password must be at least ${PASSWORD_MIN} characters.` : `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`) : null);

/** Inscription (formulaire create_customer) : un compte existant sans mot de passe en reçoit un ; sinon l'e-mail est déjà pris. */
export async function registerCustomer(storeId: string, input: { email: string; password: string; firstName?: string; lastName?: string; acceptsMarketing?: boolean }, locale: "fr" | "en" = "fr"): Promise<{ customerId?: string; error?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: locale === "en" ? "Enter a valid email address." : "Indiquez une adresse e-mail valide." };
  const bad = passwordProblem(input.password, locale);
  if (bad) return { error: bad };
  const existing = await db.customer.findUnique({ where: { storeId_email: { storeId, email } } });
  if (existing?.passwordHash) return { error: locale === "en" ? "An account already exists with this email. Sign in or reset your password." : "Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez votre mot de passe." };
  const name = [input.firstName, input.lastName].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || existing?.name || email.split("@")[0];
  const passwordHash = await bcrypt.hash(input.password, 12);
  const row = existing
    ? await db.customer.update({ where: { id: existing.id }, data: { passwordHash, name, ...(input.acceptsMarketing ? { acceptsMarketing: true, subscribedAt: new Date() } : {}) } })
    : await db.customer.create({ data: { storeId, email, name, passwordHash, locale, ...(input.acceptsMarketing ? { acceptsMarketing: true, subscribedAt: new Date() } : {}) } });
  return { customerId: row.id };
}

/** Connexion e-mail + mot de passe (formulaire customer_login). */
export async function loginWithPassword(storeId: string, emailRaw: string, password: string, locale: "fr" | "en" = "fr"): Promise<{ customerId?: string; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const customer = await db.customer.findUnique({ where: { storeId_email: { storeId, email } } });
  const ok = await bcrypt.compare(password, customer?.passwordHash ?? DUMMY_HASH);
  if (!customer?.passwordHash || !ok) return { error: locale === "en" ? "Incorrect email or password." : "E-mail ou mot de passe incorrect." };
  return { customerId: customer.id };
}

/** Demande de réinitialisation : jeton d'une heure, renvoyé pour le lien de l'e-mail (null si le compte n'existe pas, sans le dire au visiteur). */
export async function createPasswordReset(storeId: string, emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const customer = await db.customer.findUnique({ where: { storeId_email: { storeId, email } } });
  if (!customer) return null;
  const token = randomBytes(24).toString("base64url");
  await db.customer.update({ where: { id: customer.id }, data: { resetTokenHash: hash(token), resetExpiresAt: new Date(Date.now() + 3600_000) } });
  return { customerId: customer.id, token };
}

/** Nouveau mot de passe depuis le lien reçu ; le jeton ne sert qu'une fois. */
export async function resetCustomerPassword(storeId: string, customerId: string, token: string, password: string, locale: "fr" | "en" = "fr"): Promise<{ ok?: boolean; error?: string }> {
  const bad = passwordProblem(password, locale);
  if (bad) return { error: bad };
  const customer = await db.customer.findFirst({ where: { id: customerId, storeId } });
  if (!customer?.resetTokenHash || customer.resetTokenHash !== hash(token) || !customer.resetExpiresAt || customer.resetExpiresAt < new Date()) return { error: locale === "en" ? "This link has expired. Request a new one." : "Ce lien a expiré. Demandez-en un nouveau." };
  await db.customer.update({ where: { id: customer.id }, data: { passwordHash: await bcrypt.hash(password, 12), resetTokenHash: null, resetExpiresAt: null } });
  await db.customerSession.deleteMany({ where: { customerId: customer.id } }); // les anciennes sessions sont fermées
  return { ok: true };
}
