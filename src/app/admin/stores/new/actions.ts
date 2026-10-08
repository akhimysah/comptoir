"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, STORE_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { defaultTheme } from "@/lib/theme";
import { slugify } from "@/lib/utils";

const RESERVED = new Set(["admin", "api", "login", "signup", "app", "www"]);

export async function createAnotherStore(_: { error?: string } | undefined, form: FormData) {
  const user = await requireUser();
  const parsed = z.string().trim().min(2, "Donnez un nom à la boutique.").max(60).safeParse(form.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const name = parsed.data;
  const currency = ["EUR", "USD", "GBP", "CHF", "CAD", "MAD"].includes(String(form.get("currency"))) ? String(form.get("currency")) : "EUR";
  const base = slugify(name);
  let slug = RESERVED.has(base) ? `${base}-boutique` : base;
  for (let i = 2; await db.store.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const store = await db.store.create({ data: { ownerId: user.id, name, slug, currency, theme: JSON.stringify(defaultTheme(name)) } });
  (await cookies()).set(STORE_COOKIE, store.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400, secure: process.env.NODE_ENV === "production" });
  redirect("/admin?welcome=1");
}
