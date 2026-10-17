import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/errors";
import { convertManifest } from "@/lib/github-app";
import { readState } from "@/lib/secret-box";
import { appUrl } from "@/lib/stripe";

/** Retour de GitHub après la création de l'application de la plateforme (manifeste) : identifiants enregistrés. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = `${appUrl()}/admin/platform/github`;
  const parts = readState(url.searchParams.get("state"), 2);
  const user = await getUser();
  if (!user || !isPlatformAdmin(user.email) || !parts || parts[0] !== "manifest" || parts[1] !== user.id) return NextResponse.redirect(`${page}?err=${encodeURIComponent("Lien expiré ou compte non autorisé.")}`);
  try {
    await convertManifest(url.searchParams.get("code") ?? "");
  } catch (e) {
    return NextResponse.redirect(`${page}?err=${encodeURIComponent((e as Error).message)}`);
  }
  return NextResponse.redirect(`${page}?ok=1`);
}
