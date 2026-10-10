import { NextResponse } from "next/server";
import { apiError, authenticate, customerJson } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "read_customers");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const c = await db.customer.findFirst({ where: { id, storeId: auth.store.id } });
  if (!c) return apiError(404, "not_found", "Client introuvable.");
  return NextResponse.json({ data: customerJson(c) });
}
