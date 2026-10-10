import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "comptoir_session";
const MAX_AGE_DAYS = 30;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MAX_AGE_DAYS * 86400_000);
  await db.session.create({ data: { id: hash(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hash(token) } });
  jar.delete(COOKIE);
}

export const getUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: hash(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return { ...session.user, sessionId: session.id };
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export const STORE_COOKIE = "comptoir_store";

/** Toutes les boutiques auxquelles l'utilisateur a accès (propriétaire ou collaborateur). */
export const accessibleStores = cache(async (userId: string) =>
  db.store.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: "asc" },
  }),
);

/** Le marchand connecté, la boutique active (choisie dans le menu du haut) et son rôle. */
export const requireStore = cache(async () => {
  const user = await requireUser();
  const stores = await accessibleStores(user.id);
  if (!stores.length) redirect("/signup?step=store");
  const wanted = (await cookies()).get(STORE_COOKIE)?.value;
  const store = stores.find((s) => s.id === wanted) ?? stores[0];
  const isOwner = store.ownerId === user.id;
  let perms: Area[] = [...AREAS];
  if (!isOwner) {
    const m = await db.storeMember.findUnique({ where: { storeId_userId: { storeId: store.id, userId: user.id } } });
    try { perms = (JSON.parse(m?.permissions ?? "[]") as Area[]).filter((a) => AREAS.includes(a)); } catch { perms = []; }
  }
  return { user, store, stores, isOwner, perms };
});

export const AREAS = ["orders", "products", "customers", "discounts", "marketing", "analytics", "content"] as const;
export type Area = (typeof AREAS)[number];
export const AREA_LABELS: Record<Area, string> = {
  orders: "Commandes et paniers abandonnés",
  products: "Produits, stock, cartes cadeaux et avis",
  customers: "Clients",
  discounts: "Remises",
  marketing: "Marketing (newsletter et campagnes)",
  analytics: "Statistiques et vue d'ensemble",
  content: "Boutique en ligne (thème, pages, blog)",
};

/** Accès à une zone de l'admin : le propriétaire a tout, un collaborateur seulement ce qui lui a été accordé. */
export async function requirePerm(area: Area) {
  const ctx = await requireStore();
  if (!ctx.perms.includes(area)) redirect("/admin?denied=1");
  return ctx;
}

/** Pages réservées au propriétaire : paiements, collaborateurs. */
export async function requireOwner() {
  const ctx = await requireStore();
  if (!ctx.isOwner) redirect("/admin?denied=1");
  return ctx;
}

/** Boutiques où l'utilisateur a une zone donnée : celles qu'il possède, et celles où ce droit lui a été accordé. */
export async function storesWithPerm(userId: string, area: Area) {
  const stores = await db.store.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    include: { members: { where: { userId }, select: { permissions: true } } },
    orderBy: { createdAt: "asc" },
  });
  return stores.filter((s) => {
    if (s.ownerId === userId) return true;
    try { return (JSON.parse(s.members[0]?.permissions ?? "[]") as string[]).includes(area); } catch { return false; }
  }).map(({ members: _m, ...store }) => store);
}
