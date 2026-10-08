import "server-only";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

/** L'invitation correspondant au jeton du lien, si elle est encore valable. */
export async function findValidInvite(token: string) {
  const invite = await db.storeInvite.findUnique({ where: { token: hashToken(token) }, include: { store: true } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return null;
  return invite;
}
