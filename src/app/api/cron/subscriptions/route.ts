import { NextResponse } from "next/server";
import { renewDueSubscriptions } from "@/lib/renewals";

/** À appeler chaque jour (Vercel Cron) avec « Authorization: Bearer <CRON_SECRET> ». */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json({ renewed: await renewDueSubscriptions() });
}
