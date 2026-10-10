"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachDomainToHost, checkDomainTxt, detachDomainFromHost, forgetDomain, newDomainToken, normalizeDomain } from "@/lib/domains";

const back = (msg: string, kind: "err" | "ok" = "err") => redirect(`/admin/settings/domain?${kind}=${encodeURIComponent(msg)}`);

export async function saveDomain(form: FormData) {
  const { store } = await requireOwner();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) back("Nom de domaine invalide. Exemple : www.maboutique.fr");
  if (domain === store.domain) back("C'est déjà le domaine de la boutique.");
  if (await db.store.findFirst({ where: { domain, NOT: { id: store.id } } })) back("Ce domaine est déjà utilisé par une autre boutique.");
  if (store.domain) { await detachDomainFromHost(store.domain); forgetDomain(store.domain); }
  await db.store.update({ where: { id: store.id }, data: { domain, domainToken: newDomainToken(), domainVerifiedAt: null } });
  await logActivity(`Domaine ${domain} ajouté`, "/admin/settings/domain");
  revalidatePath("/admin/settings/domain");
}

export async function verifyDomain() {
  const { store } = await requireOwner();
  if (!store.domain || !store.domainToken) return;
  const problem = await checkDomainTxt(store.domain, store.domainToken);
  if (problem) back(problem);
  const host = await attachDomainToHost(store.domain!);
  await db.store.update({ where: { id: store.id }, data: { domainVerifiedAt: new Date() } });
  forgetDomain(store.domain!);
  await logActivity(`Domaine ${store.domain} vérifié`, "/admin/settings/domain");
  revalidatePath("/admin", "layout");
  back(host === "failed" ? "Domaine vérifié, mais l'ajout chez l'hébergeur a échoué : ajoutez-le à la main pour obtenir le certificat HTTPS." : "Domaine vérifié : la boutique est maintenant servie à cette adresse.", host === "failed" ? "err" : "ok");
}

export async function removeDomain() {
  const { store } = await requireOwner();
  if (!store.domain) return;
  await detachDomainFromHost(store.domain);
  forgetDomain(store.domain);
  await db.store.update({ where: { id: store.id }, data: { domain: null, domainToken: null, domainVerifiedAt: null } });
  await logActivity(`Domaine ${store.domain} retiré`, "/admin/settings/domain");
  revalidatePath("/admin", "layout");
}
