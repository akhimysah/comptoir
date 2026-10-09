import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/**
 * Compte un essai pour cette clé et dit s'il est encore autorisé (max essais par fenêtre).
 * Stocké en base pour tenir sur plusieurs serveurs.
 */
export async function hit(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt < now) {
    await db.rateLimit.upsert({ where: { key }, update: { count: 1, resetAt: new Date(now.getTime() + windowMs) }, create: { key, count: 1, resetAt: new Date(now.getTime() + windowMs) } });
    return true;
  }
  const r = await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return r.count <= max;
}

export async function clearLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** Adresse IP du visiteur (derrière l'hébergeur), pour limiter par appareil. */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}
