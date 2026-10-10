"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashRecovery, matchStep, newRecoveryCodes, newSecret } from "@/lib/totp";
import { verifySecondFactor } from "@/lib/two-factor";

export type TwoFaState = { error?: string; codes?: string[]; done?: string } | undefined;

/** Étape 1 : une nouvelle clé est préparée (pas encore active). */
export async function beginSetup() {
  const user = await requireUser();
  if (user.totpEnabled) return;
  await db.user.update({ where: { id: user.id }, data: { totpPending: newSecret() } });
  revalidatePath("/admin/account");
}

/** Étape 2 : le code de l'application prouve que la clé est bien enregistrée ; on active et on affiche les codes de secours. */
export async function confirmSetup(_: TwoFaState, form: FormData): Promise<TwoFaState> {
  const user = await requireUser();
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (!fresh?.totpPending) return { error: "Recommencez l'activation." };
  const step = matchStep(fresh.totpPending, String(form.get("code") ?? ""));
  if (step === null) return { error: "Code incorrect. Vérifiez que l'heure de votre téléphone est à jour." };
  const codes = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: fresh.totpPending, totpPending: null, totpEnabled: true, totpLastStep: step, recoveryCodes: JSON.stringify(codes.map(hashRecovery)) } });
  // Par sécurité, les autres appareils connectés sont déconnectés.
  await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
  await logActivity("Double authentification activée", "/admin/account");
  // Pas de rafraîchissement ici : les codes de secours doivent rester affichés jusqu'à ce que l'utilisateur les ait notés.
  return { codes, done: "La double authentification est activée." };
}

export async function cancelSetup() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { totpPending: null } });
  revalidatePath("/admin/account");
}

export async function regenerateCodes(_: TwoFaState, form: FormData): Promise<TwoFaState> {
  const user = await requireUser();
  if (!(await verifySecondFactor(user.id, String(form.get("code") ?? "")))) return { error: "Code incorrect." };
  const codes = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(codes.map(hashRecovery)) } });
  revalidatePath("/admin/account");
  return { codes, done: "Nouveaux codes de secours : les anciens ne fonctionnent plus." };
}

/** Désactivation : mot de passe ET code demandés. */
export async function disableTwoFactor(_: TwoFaState, form: FormData): Promise<TwoFaState> {
  const user = await requireUser();
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (!fresh || !(await bcrypt.compare(String(form.get("password") ?? ""), fresh.passwordHash))) return { error: "Mot de passe incorrect." };
  if (!(await verifySecondFactor(user.id, String(form.get("code") ?? "")))) return { error: "Code incorrect." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, totpPending: null, totpLastStep: null, recoveryCodes: "[]" } });
  await logActivity("Double authentification désactivée", "/admin/account");
  revalidatePath("/admin/account");
  return { done: "Double authentification désactivée." };
}
