import { NextResponse } from "next/server";
import { runAutomations } from "@/lib/automations";

/** Relances et demandes d'avis automatiques, une fois par jour. En-tête « Authorization: Bearer <CRON_SECRET> ». */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json(await runAutomations());
}
