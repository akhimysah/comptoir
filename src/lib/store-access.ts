import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { accessibleStores, getUser } from "./auth";

type Gate = { id: string; passwordEnabled: boolean; storePassword: string };

export const passCookie = (storeId: string) => `sp_${storeId}`;

/** Valeur du cookie d'accès : liée au mot de passe, donc invalidée dès qu'il change. */
export const passValue = (s: Gate) => createHash("sha256").update(`${s.id}:${s.storePassword}:${process.env.SESSION_SECRET ?? "parnassa"}`).digest("base64url");

export function passwordMatches(s: Gate, input: string) {
  const a = createHash("sha256").update(input.trim()).digest();
  const b = createHash("sha256").update(s.storePassword).digest();
  return s.storePassword.length > 0 && timingSafeEqual(a, b);
}

/**
 * Accès à une boutique protégée : visiteur avec le bon cookie, ou membre de l'équipe connecté (aperçu).
 * Renvoie { allowed, preview } ; preview = l'équipe voit la boutique malgré la protection.
 */
export async function storeAccess(s: Gate) {
  if (!s.passwordEnabled) return { allowed: true, preview: false };
  const jar = await cookies();
  if (jar.get(passCookie(s.id))?.value === passValue(s)) return { allowed: true, preview: false };
  const user = await getUser();
  if (user && (await accessibleStores(user.id)).some((x) => x.id === s.id)) return { allowed: true, preview: true };
  return { allowed: false, preview: false };
}
