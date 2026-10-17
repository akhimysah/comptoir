import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { appConfig, GH_WEB } from "@/lib/github-app";
import { signState } from "@/lib/secret-box";
import { appUrl } from "@/lib/stripe";

/** « Se connecter à GitHub » : installation de l'application GitHub de la plateforme sur le compte du marchand. */
export async function GET() {
  const { user, store } = await requireOwner();
  const app = await appConfig();
  if (!app) return NextResponse.redirect(`${appUrl()}/admin/theme?gherr=${encodeURIComponent("La connexion GitHub n'est pas encore activée sur la plateforme.")}#github`);
  const state = signState(["install", store.id, user.id]);
  const res = NextResponse.redirect(`${GH_WEB()}/apps/${app.slug}/installations/new?state=${encodeURIComponent(state)}`);
  // Le retour doit se faire dans le même navigateur que celui qui a cliqué.
  res.cookies.set("gh_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/github", maxAge: 15 * 60 });
  return res;
}
