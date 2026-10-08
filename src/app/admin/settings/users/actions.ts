"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashToken, newToken } from "@/lib/invites";
import { appUrl } from "@/lib/stripe";

export type InviteState = { error?: string; link?: string; email?: string } | undefined;

export async function inviteMember(_: InviteState, form: FormData): Promise<InviteState> {
  const { user, store } = await requireOwner();
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Indiquez une adresse e-mail valide." };
  const email = parsed.data;
  if (email === user.email) return { error: "C'est votre propre adresse." };
  const existing = await db.storeMember.findFirst({ where: { storeId: store.id, user: { email } } });
  if (existing) return { error: "Cette personne fait déjà partie de l'équipe." };

  const token = newToken();
  await db.storeInvite.deleteMany({ where: { storeId: store.id, email, acceptedAt: null } });
  await db.storeInvite.create({ data: { storeId: store.id, email, token: hashToken(token), invitedBy: user.name, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  revalidatePath("/admin/settings/users");
  return { link: `${appUrl()}/invite/${token}`, email };
}

export async function revokeInvite(form: FormData) {
  const { store } = await requireOwner();
  await db.storeInvite.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/settings/users");
}

export async function removeMember(form: FormData) {
  const { store } = await requireOwner();
  const member = await db.storeMember.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (member) {
    await db.$transaction([
      db.storeMember.delete({ where: { id: member.id } }),
      db.session.deleteMany({ where: { userId: member.userId } }), // déconnecte la personne retirée
    ]);
  }
  revalidatePath("/admin/settings/users");
}
