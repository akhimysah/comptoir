import { NextResponse } from "next/server";
import { authenticate, customerJson, page, paged } from "@/lib/api";
import { db, textSearch } from "@/lib/db";

/** Liste des clients : ?email=adresse exacte, ?q=nom ou e-mail, pagination ?limit et ?after. */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read_customers");
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const { limit, ...p } = page(url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const q = url.searchParams.get("q");
  const rows = await db.customer.findMany({
    where: { storeId: auth.store.id, ...(email ? { email } : {}), ...(q ? { OR: [{ name: textSearch(q) }, { email: textSearch(q) }] } : {}) },
    ...p,
  });
  const { data, next } = paged(rows, limit);
  return NextResponse.json({ data: data.map(customerJson), next });
}
