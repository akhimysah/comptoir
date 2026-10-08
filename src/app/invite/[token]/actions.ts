"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { findValidInvite } from "@/lib/invites";

async function join(inviteId: string, storeId: string, userId: string) {
  await db.$transaction([
    db.storeMember.upsert({ where: { storeId_userId: { storeId, userId } }, update: {}, create: { storeId, userId } }),
    db.storeInvite.update({ where: { id: inviteId }, data: { acceptedAt: new Date() } }),
  ]);
}

/** Compte déjà connecté avec la bonne adresse. */
export async function acceptInvite(form: FormData) {
  const token = String(form.get("token"));
  const user = await getUser();
  const invite = await findValidInvite(token);
  if (!user || !invite || user.email !== invite.email) redirect(`/invite/${token}`);
  await join(invite.id, invite.storeId, user.id);
  redirect("/admin?welcome=1");
}

const schema = z.object({
  name: z.string().trim().min(1, "Indiquez votre nom.").max(80),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères.").max(200),
});

/** Nouvelle personne : création du compte avec l'adresse de l'invitation. */
export async function signupFromInvite(_: { error?: string } | undefined, form: FormData) {
  const token = String(form.get("token"));
  const invite = await findValidInvite(token);
  if (!invite) return { error: "Cette invitation n'est plus valable. Demandez-en une nouvelle." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.user.findUnique({ where: { email: invite.email } })) return { error: "Un compte existe déjà avec cette adresse. Connectez-vous." };
  const user = await db.user.create({ data: { email: invite.email, name: parsed.data.name, passwordHash: await bcrypt.hash(parsed.data.password, 12) } });
  await join(invite.id, invite.storeId, user.id);
  await createSession(user.id);
  redirect("/admin?welcome=1");
}
