import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** Codes à 6 chiffres des applications d'authentification (RFC 6238 : HMAC-SHA1, pas de 30 s). */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const currentStep = (t = Date.now()) => Math.floor(t / 30_000);

/** Pas de 30 s correspondant au code (tolérance d'un pas avant/après pour le décalage d'horloge), ou null. */
export function matchStep(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer = "Parnassa Pay") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Codes de secours : affichés une seule fois, seules leurs empreintes sont gardées. */
export const hashRecovery = (c: string) => createHash("sha256").update(c.replace(/[^a-z0-9]/gi, "").toLowerCase()).digest("hex");
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => { const r = randomBytes(5).toString("hex"); return `${r.slice(0, 5)}-${r.slice(5)}`; });
}
