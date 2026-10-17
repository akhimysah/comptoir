import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyInstallationOwner } from "@/lib/github-app";
import { readState } from "@/lib/secret-box";
import { appUrl } from "@/lib/stripe";

const back = (kind: "ghok" | "gherr", msg: string) => NextResponse.redirect(`${appUrl()}/admin/theme?${kind}=${encodeURIComponent(msg)}#github`);

/** Retour de GitHub après l'installation de l'application : l'installation est rattachée à la boutique. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const parts = readState(state, 3);
  const jar = await cookies();
  const sameBrowser = state && jar.get("gh_state")?.value === state;
  jar.delete({ name: "gh_state", path: "/api/github" });
  if (url.searchParams.get("setup_action") === "request") return back("ghok", "Demande envoyée aux administrateurs de l'organisation GitHub : revenez ici une fois l'application approuvée.");
  if (!parts || parts[0] !== "install" || !sameBrowser) return back("gherr", "Lien de connexion expiré. Recommencez depuis « Se connecter à GitHub ».");
  const [, storeId, userId] = parts;
  const user = await getUser();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!user || user.id !== userId || store?.ownerId !== user.id) return back("gherr", "Connectez-vous au compte qui a lancé la connexion GitHub.");
  const installationId = Number(url.searchParams.get("installation_id"));
  const code = url.searchParams.get("code");
  if (!Number.isInteger(installationId) || installationId <= 0 || !code) return back("gherr", "GitHub n'a pas renvoyé l'installation. Recommencez.");
  try {
    if (!(await verifyInstallationOwner(code, installationId))) return back("gherr", "Cette installation GitHub n'appartient pas à votre compte.");
  } catch (e) {
    return back("gherr", (e as Error).message);
  }
  await db.store.update({ where: { id: store.id }, data: { githubInstallationId: installationId } });
  return back("ghok", "Compte GitHub connecté. Choisissez maintenant le dépôt du thème.");
}
