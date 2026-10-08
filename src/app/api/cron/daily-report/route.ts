import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { buildDailyReport } from "@/lib/reports";

/**
 * Envoie le rapport d'hier à chaque marchand qui l'a activé.
 * À appeler chaque matin par un planificateur (Vercel Cron, cron-job.org…) avec l'en-tête
 * « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const users = await db.user.findMany({ where: { dailyReport: true, OR: [{ stores: { some: {} } }, { memberships: { some: {} } }] } });
  let sent = 0;
  for (const u of users) {
    const stores = await db.store.findMany({ where: { OR: [{ ownerId: u.id }, { members: { some: { userId: u.id } } }] }, orderBy: { createdAt: "asc" } });
    if (!stores.length) continue;
    await sendMail({ to: u.email, storeId: stores[0].id, ...(await buildDailyReport(stores)) });
    sent++;
  }
  return NextResponse.json({ sent });
}
