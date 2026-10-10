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
