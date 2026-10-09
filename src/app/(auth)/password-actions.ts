"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { passwordResetEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";
import { findReset, hashResetToken as hash } from "@/lib/password-reset";
import { appUrl } from "@/lib/stripe";
import { clientIp, hit } from "@/lib/rate-limit";


export async function requestReset(_: { sent?: boolean; error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "Indiquez une adresse e-mail valide." };
  if (!(await hit(`reset:${email}`, 3, 3600_000)) || !(await hit(`reset:ip:${await clientIp()}`, 10, 3600_000))) return { sent: true };
  const user = await db.user.findUnique({ where: { email } });
  // Même réponse que le compte existe ou non, pour ne pas révéler qui est inscrit.
  if (user) {
    const token = randomBytes(24).toString("base64url");
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600_000) } });
    const link = `${appUrl()}/reset/${token}`;
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") console.log(`[mot de passe oublié] Lien pour ${email} : ${link}`);
    await sendMail({ to: email, ...passwordResetEmail(link) });
  }
  return { sent: true };
}

export async function resetPassword(_: { error?: string } | undefined, form: FormData) {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Le mot de passe doit faire au moins 8 caractères." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "Les deux mots de passe ne correspondent pas." };
  const r = await findReset(token);
  if (!r) return { error: "Ce lien n'est plus valable. Refaites une demande." };
  await db.$transaction([
    db.user.update({ where: { id: r.userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    db.passwordReset.updateMany({ where: { userId: r.userId, usedAt: null }, data: { usedAt: new Date() } }), // tous les liens envoyés
    db.session.deleteMany({ where: { userId: r.userId } }), // déconnecte les autres appareils
  ]);
  await createSession(r.userId);
  redirect("/admin");
}
