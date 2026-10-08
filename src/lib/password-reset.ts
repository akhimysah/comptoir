import "server-only";
import { createHash } from "crypto";
import { db } from "./db";

export const hashResetToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** La demande de réinitialisation liée au jeton, si elle est encore valable. */
export async function findReset(token: string) {
  const r = await db.passwordReset.findUnique({ where: { tokenHash: hashResetToken(token) } });
  return r && !r.usedAt && r.expiresAt > new Date() ? r : null;
}
