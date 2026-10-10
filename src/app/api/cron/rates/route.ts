import { NextResponse } from "next/server";
import { refreshStoreRates } from "@/lib/currency";
import { db } from "@/lib/db";

/** Taux de change du jour pour les boutiques qui l'ont demandé (chaque matin, en-tête « Authorization: Bearer <CRON_SECRET> »). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const stores = await db.store.findMany({ where: { autoRates: true, NOT: { displayCurrencies: "[]" } } });
  let updated = 0;
  for (const s of stores) if (await refreshStoreRates(s)) updated++;
  return NextResponse.json({ updated, stores: stores.length });
}
