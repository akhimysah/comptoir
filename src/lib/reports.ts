import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { formatMoney } from "./money";
import { appUrl } from "./stripe";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Rapport d'une journée (par défaut hier) pour toutes les boutiques d'un utilisateur. */
export async function buildDailyReport(stores: Store[], day?: Date) {
  const start = day ? new Date(day) : new Date(Date.now() - 86400_000);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const weekAgo = new Date(start); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoEnd = new Date(weekAgo); weekAgoEnd.setDate(weekAgoEnd.getDate() + 1);
  const ids = stores.map((s) => s.id);
  const paid = { storeId: { in: ids }, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null };

  const [orders, lastWeek, toShip, items] = await Promise.all([
    db.order.groupBy({ by: ["storeId"], where: { ...paid, createdAt: { gte: start, lt: end } }, _sum: { totalCents: true, refundedCents: true }, _count: true }),
    db.order.groupBy({ by: ["storeId"], where: { ...paid, createdAt: { gte: weekAgo, lt: weekAgoEnd } }, _sum: { totalCents: true, refundedCents: true } }),
    db.order.groupBy({ by: ["storeId"], where: { ...paid, fulfillmentStatus: "unfulfilled" }, _count: true }),
    db.orderItem.groupBy({ by: ["productTitle"], where: { order: { ...paid, createdAt: { gte: start, lt: end } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 3 }),
  ]);

  const rows = stores.map((s) => {
    const o = orders.find((x) => x.storeId === s.id);
    const revenue = (o?._sum.totalCents ?? 0) - (o?._sum.refundedCents ?? 0);
    const lw = lastWeek.find((x) => x.storeId === s.id)?._sum;
    const prev = (lw?.totalCents ?? 0) - (lw?.refundedCents ?? 0);
    return { s, revenue, count: o?._count ?? 0, prev, toShip: toShip.find((x) => x.storeId === s.id)?._count ?? 0 };
  });
  const cur = stores[0]?.currency ?? "EUR";
  const same = rows.filter((r) => r.s.currency === cur);
  const total = same.reduce((t, r) => t + r.revenue, 0);
  const totalCount = same.reduce((t, r) => t + r.count, 0);
  const totalPrev = same.reduce((t, r) => t + r.prev, 0);
  const dateLabel = start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const trend = (a: number, b: number) => (b ? `${a >= b ? "↗" : "↘"} ${Math.abs(Math.round(((a - b) / b) * 100))} % vs ${weekAgo.toLocaleDateString("fr-FR", { weekday: "long" })} dernier` : "");

  const td = "padding:10px 8px;border-bottom:1px solid #ebebeb;font-size:14px";
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
<tr><th align="left" style="${td};color:#616161;font-weight:600">Boutique</th><th align="right" style="${td};color:#616161;font-weight:600">Commandes</th><th align="right" style="${td};color:#616161;font-weight:600">CA</th><th align="right" style="${td};color:#616161;font-weight:600">À expédier</th></tr>
${rows.map((r) => `<tr><td style="${td}">${esc(r.s.name)}</td><td align="right" style="${td}">${r.count}</td><td align="right" style="${td};font-weight:600">${formatMoney(r.revenue, r.s.currency)}</td><td align="right" style="${td}">${r.toShip}</td></tr>`).join("")}
<tr><td style="${td};font-weight:700">Total</td><td align="right" style="${td};font-weight:700">${totalCount}</td><td align="right" style="${td};font-weight:700">${formatMoney(total, cur)}</td><td align="right" style="${td};font-weight:700">${rows.reduce((t, r) => t + r.toShip, 0)}</td></tr></table>`;

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f1f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#303030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<div style="font-size:13px;color:#616161;text-transform:capitalize">${esc(dateLabel)}</div>
<h1 style="font-size:28px;margin:6px 0 2px">${formatMoney(total, cur)}</h1>
<div style="font-size:14px;color:#616161">${totalCount} commande${totalCount > 1 ? "s" : ""} sur ${stores.length} boutique${stores.length > 1 ? "s" : ""}${totalPrev ? ` · ${trend(total, totalPrev)}` : ""}</div>
${table}
${items.length ? `<p style="font-size:14px;margin:0 0 6px;font-weight:600">Produits les plus vendus</p><p style="font-size:14px;margin:0;color:#616161">${items.map((i) => `${esc(i.productTitle)} (${i._sum.quantity})`).join(" · ")}</p>` : ""}
<p style="margin-top:24px"><a href="${appUrl()}/admin/overview" style="display:inline-block;background:#303030;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Ouvrir le tableau de bord</a></p>
</td></tr></table>
<p style="font-size:12px;color:#8a8a8a;margin-top:16px">Rapport quotidien Parnassa Pay · désactivable depuis « Toutes les boutiques »</p>
</td></tr></table></body></html>`;

  return { subject: `${formatMoney(total, cur)} hier · ${totalCount} commande${totalCount > 1 ? "s" : ""} (${stores.length} boutique${stores.length > 1 ? "s" : ""})`, html };
}
