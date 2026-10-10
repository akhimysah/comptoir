import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { hashRecovery, matchStep } from "./totp";

export const CHALLENGE_COOKIE = "comptoir_2fa";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Mot de passe correct mais 2FA active : on garde une connexion « en attente » 10 minutes, le temps de saisir le code. */
export async function startChallenge(userId: string, next: string) {
  const token = randomBytes(32).toString("base64url");
  await db.loginChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  await db.loginChallenge.create({ data: { id: hash(token), userId, next, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
}

export async function currentChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const c = await db.loginChallenge.findUnique({ where: { id: hash(token) } });
  return c && c.expiresAt > new Date() ? c : null;
}

export async function clearChallenge(id: string) {
  await db.loginChallenge.deleteMany({ where: { id } });
  (await cookies()).delete(CHALLENGE_COOKIE);
}

/**
 * Vérifie un code de l'application (une seule utilisation par pas de 30 s) ou un code de secours (consommé).
 * Renvoie le type de code accepté, ou null.
 */
export async function verifySecondFactor(userId: string, input: string): Promise<"totp" | "recovery" | null> {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u?.totpEnabled || !u.totpSecret) return null;
  const step = matchStep(u.totpSecret, input);
  if (step !== null) {
    // Mise à jour conditionnelle : un code déjà utilisé (même pas ou plus ancien) est refusé.
    const ok = await db.user.updateMany({ where: { id: u.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return ok.count ? "totp" : null;
  }
  const codes: string[] = JSON.parse(u.recoveryCodes || "[]");
  const h = hashRecovery(input);
  if (!codes.includes(h)) return null;
  const ok = await db.user.updateMany({ where: { id: u.id, recoveryCodes: u.recoveryCodes }, data: { recoveryCodes: JSON.stringify(codes.filter((c) => c !== h)) } });
  return ok.count ? "recovery" : null;
}
