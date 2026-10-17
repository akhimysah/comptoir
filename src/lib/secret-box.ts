import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** Chiffrement des secrets gardés en base (AES-256-GCM, clé dérivée de SESSION_SECRET). */
const key = () => createHash("sha256").update(`github:${process.env.SESSION_SECRET ?? "parnassa-dev"}`).digest();

export function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function open(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** Jeton signé à durée limitée (paramètre « state » des allers-retours avec GitHub). */
export function signState(parts: string[], ttlMs = 15 * 60_000) {
  const body = [...parts, String(Date.now() + ttlMs)].join(".");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function readState(state: string | null, count: number): string[] | null {
  if (!state) return null;
  const all = state.split(".");
  if (all.length !== count + 2) return null;
  const sig = all.pop()!;
  const body = all.join(".");
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(all.pop()) < Date.now()) return null;
  return all;
}
