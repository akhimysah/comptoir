import "server-only";
import { z } from "zod";
import { db } from "./db";
import { parseJson } from "./utils";
import { SEGMENT_FIELDS, type SegmentField } from "./segment-fields";

export { SEGMENT_FIELDS, type SegmentField };

export const ruleSchema = z.object({
  field: z.enum(Object.keys(SEGMENT_FIELDS) as [SegmentField, ...SegmentField[]]),
  op: z.string().max(10),
  value: z.string().trim().max(120).default(""), // montants en centimes
}).refine((r) => r.op in SEGMENT_FIELDS[r.field].ops, { message: "Condition invalide." });
export type Rule = z.infer<typeof ruleSchema>;

/** Modèles proposés à la création, comme les segments suggérés de Shopify. */
export const SEGMENT_TEMPLATES: { name: string; match: "all" | "any"; rules: Rule[] }[] = [
  { name: "Clients fidèles", match: "all", rules: [{ field: "orders", op: "gte", value: "3" }] },
  { name: "Gros acheteurs", match: "all", rules: [{ field: "spent", op: "gte", value: "20000" }] },
  { name: "Clients à relancer", match: "all", rules: [{ field: "orders", op: "gte", value: "1" }, { field: "lastOrder", op: "before", value: "90" }] },
  { name: "Abonnés sans commande", match: "all", rules: [{ field: "marketing", op: "yes", value: "" }, { field: "orders", op: "eq", value: "0" }] },
  { name: "Nouveaux clients (30 jours)", match: "all", rules: [{ field: "created", op: "within", value: "30" }] },
];

export const splitTags = (tags: string) => [...new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

export type CustomerStats = {
  id: string; name: string; email: string; acceptsMarketing: boolean; marketingToken: string | null; points: number; createdAt: Date;
  tags: string[]; orders: number; spent: number; avg: number; last: Date | null; country: string; productIds: Set<string>;
};

/** Chiffres de chaque client de la boutique (commandes payées, montant net, dernier achat, produits achetés). */
export async function customerStats(storeId: string): Promise<CustomerStats[]> {
  const customers = await db.customer.findMany({
    where: { storeId },
    include: { orders: { where: { paymentStatus: { in: ["paid", "partially_refunded", "refunded"] }, cancelledAt: null }, select: { totalCents: true, refundedCents: true, createdAt: true, address: true, paymentStatus: true, items: { select: { variantId: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const variantIds = [...new Set(customers.flatMap((c) => c.orders.flatMap((o) => o.items.map((i) => i.variantId)).filter((v): v is string => !!v)))];
  const variants = await db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, productId: true } });
  const productOf = new Map(variants.map((v) => [v.id, v.productId]));
  return customers.map((c) => {
    const paid = c.orders.filter((o) => o.paymentStatus !== "refunded");
    const spent = c.orders.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
    const latest = [...c.orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      id: c.id, name: c.name, email: c.email, acceptsMarketing: c.acceptsMarketing, marketingToken: c.marketingToken, points: c.points, createdAt: c.createdAt,
      tags: splitTags(c.tags),
      orders: paid.length,
      spent,
      avg: paid.length ? Math.round(spent / paid.length) : 0,
      last: latest?.createdAt ?? null,
      country: latest ? parseJson<{ country?: string }>(latest.address, {}).country?.trim() ?? "" : "",
      productIds: new Set(c.orders.flatMap((o) => o.items.map((i) => (i.variantId ? productOf.get(i.variantId) : undefined)).filter((p): p is string => !!p))),
    };
  });
}

const DAY = 86400_000;

function test(c: CustomerStats, r: Rule, now: number): boolean {
  const n = Number(r.value);
  const cmp = (x: number) => (r.op === "gte" ? x >= n : r.op === "lte" ? x <= n : x === n);
  switch (r.field) {
    case "orders": return cmp(c.orders);
    case "spent": return cmp(c.spent);
    case "avg": return cmp(c.avg);
    case "points": return cmp(c.points);
    case "lastOrder":
      if (r.op === "never") return !c.last;
      if (!c.last) return false;
      return r.op === "within" ? now - c.last.getTime() <= n * DAY : now - c.last.getTime() > n * DAY;
    case "created": return r.op === "within" ? now - c.createdAt.getTime() <= n * DAY : now - c.createdAt.getTime() > n * DAY;
    case "marketing": return r.op === "yes" ? c.acceptsMarketing : !c.acceptsMarketing;
    case "tag": { const has = c.tags.includes(r.value.trim().toLowerCase()); return r.op === "has" ? has : !has; }
    case "product": { const has = c.productIds.has(r.value); return r.op === "bought" ? has : !has; }
    case "country": { const same = c.country.toLowerCase() === r.value.trim().toLowerCase(); return r.op === "is" ? same : !same; }
  }
}

/** Clients qui correspondent au segment. Sans condition, tous les clients. */
export function applySegment(customers: CustomerStats[], match: string, rules: Rule[]) {
  if (!rules.length) return customers;
  const now = Date.now();
  return customers.filter((c) => (match === "any" ? rules.some((r) => test(c, r, now)) : rules.every((r) => test(c, r, now))));
}

export const segmentRules = (s: { rules: string }) => {
  const parsed = z.array(ruleSchema).safeParse(parseJson(s.rules, []));
  return parsed.success ? parsed.data : [];
};

/** Membres d'un segment enregistré de la boutique (null si le segment n'existe pas). */
export async function segmentMembers(storeId: string, segmentId: string) {
  const seg = await db.segment.findFirst({ where: { id: segmentId, storeId } });
  if (!seg) return null;
  return applySegment(await customerStats(storeId), seg.match, segmentRules(seg));
}
