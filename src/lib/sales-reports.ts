import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { includedTax, rateLabel } from "./tax";

export const REPORTS = {
  daily: { title: "Ventes par jour", text: "Ventes brutes, remises, retours, ventes nettes, livraison et TVA, jour par jour." },
  products: { title: "Ventes par produit", text: "Quantités vendues, ventes nettes, coût et marge de chaque produit." },
  channels: { title: "Ventes par canal", text: "Boutique en ligne, point de vente, commandes manuelles." },
  taxes: { title: "TVA collectée", text: "Base hors taxes, TVA et montant TTC par mois et par taux, pour votre comptabilité." },
  customers: { title: "Meilleurs clients", text: "Les clients qui ont le plus acheté sur la période." },
} as const;
export type ReportType = keyof typeof REPORTS;

export type Column = { label: string; money?: boolean; num?: boolean };
export type Report = { columns: Column[]; rows: (string | number)[][]; totals: (string | number)[] | null };

const PAID = ["paid", "partially_refunded", "refunded"];
const day = (d: Date) => d.toISOString().slice(0, 10);
const month = (d: Date) => d.toISOString().slice(0, 7);
const sum = (rows: (string | number)[][], i: number) => rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);

/** Période : du début du jour « from » à la fin du jour « to ». */
export function parseRange(from?: string, to?: string) {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const end = ok(to) ?? day(new Date());
  const start = ok(from) ?? day(new Date(Date.now() - 29 * 86400_000));
  const a = new Date(`${start}T00:00:00.000Z`), b = new Date(`${end}T23:59:59.999Z`);
  return a <= b ? { from: a, to: b, fromStr: start, toStr: end } : { from: b, to: a, fromStr: end, toStr: start };
}

export async function buildReport(store: Store, type: ReportType, from: Date, to: Date): Promise<Report> {
  const orders = await db.order.findMany({ where: { storeId: store.id, paymentStatus: { in: PAID }, createdAt: { gte: from, lte: to } }, include: { items: true }, orderBy: { createdAt: "asc" } });

  if (type === "daily") {
    // Les retours sont comptés le jour du remboursement (même pour une commande plus ancienne).
    const refunds = await db.refund.findMany({ where: { order: { storeId: store.id }, createdAt: { gte: from, lte: to } }, include: { order: { select: { taxRateBps: true } } } });
    const days = new Map<string, { n: number; gross: number; disc: number; ret: number; ship: number; tax: number }>();
    const get = (k: string) => days.get(k) ?? { n: 0, gross: 0, disc: 0, ret: 0, ship: 0, tax: 0 };
    for (const o of orders) { const d = get(day(o.createdAt)); d.n++; d.gross += o.subtotalCents; d.disc += o.discountCents; d.ship += o.shippingCents; d.tax += o.taxCents; days.set(day(o.createdAt), d); }
    for (const r of refunds) { const d = get(day(r.createdAt)); d.ret += r.amountCents; d.tax -= includedTax(r.amountCents, r.order.taxRateBps); days.set(day(r.createdAt), d); }
    const rows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, d]) => [k.split("-").reverse().join("/"), d.n, d.gross, d.disc, d.ret, d.gross - d.disc - d.ret, d.ship, d.tax, d.gross - d.disc - d.ret + d.ship]);
    const columns: Column[] = [{ label: "Jour" }, { label: "Commandes", num: true }, { label: "Ventes brutes", money: true }, { label: "Remises", money: true }, { label: "Retours", money: true }, { label: "Ventes nettes", money: true }, { label: "Livraison", money: true }, { label: "dont TVA", money: true }, { label: "Total", money: true }];
    return { columns, rows, totals: ["Total", ...columns.slice(1).map((_, i) => sum(rows, i + 1))] };
  }

  if (type === "products") {
    const map = new Map<string, { qty: number; net: number; cost: number; costed: boolean }>();
    for (const o of orders) for (const i of o.items) {
      const kept = i.quantity - i.refundedQuantity;
      if (kept <= 0) continue;
      const name = `${i.productTitle}${i.variantTitle !== "Par défaut" ? ` · ${i.variantTitle}` : ""}`;
      const cur = map.get(name) ?? { qty: 0, net: 0, cost: 0, costed: true };
      cur.qty += kept;
      cur.net += Math.round(i.priceCents * kept * (o.subtotalCents ? 1 - o.discountCents / o.subtotalCents : 1));
      if (i.costCents === null) cur.costed = false; else cur.cost += i.costCents * kept;
      map.set(name, cur);
    }
    const rows = [...map.entries()].sort((a, b) => b[1].net - a[1].net).map(([name, p]) => [name, p.qty, p.net, p.costed ? p.cost : "—", p.costed ? p.net - p.cost : "—", p.costed && p.net ? `${Math.round(((p.net - p.cost) / p.net) * 100)} %` : "—"]);
    return { columns: [{ label: "Produit" }, { label: "Quantité", num: true }, { label: "Ventes nettes", money: true }, { label: "Coût", money: true }, { label: "Marge brute", money: true }, { label: "Marge" }], rows, totals: ["Total", sum(rows, 1), sum(rows, 2), "", "", ""] };
  }

  if (type === "channels") {
    const label = (m: string) => (m === "pos_cash" ? "Point de vente · espèces" : m === "pos_card" ? "Point de vente · carte" : m === "manual" ? "Commandes manuelles" : "Boutique en ligne");
    const map = new Map<string, { n: number; net: number }>();
    for (const o of orders) { const k = label(o.paymentMethod); const c = map.get(k) ?? { n: 0, net: 0 }; c.n++; c.net += o.totalCents + o.giftCardCents - o.refundedCents; map.set(k, c); }
    const rows = [...map.entries()].sort((a, b) => b[1].net - a[1].net).map(([k, c]) => [k, c.n, c.net, c.n ? Math.round(c.net / c.n) : 0]);
    const n = sum(rows, 1), net = sum(rows, 2);
    return { columns: [{ label: "Canal" }, { label: "Commandes", num: true }, { label: "Ventes (remboursements déduits)", money: true }, { label: "Panier moyen", money: true }], rows, totals: ["Total", n, net, n ? Math.round(net / n) : 0] };
  }

  if (type === "taxes") {
    // Base taxable : ce que le client a payé (carte cadeau utilisée comprise), moins les cartes cadeaux vendues et les remboursements.
    const map = new Map<string, { ttc: number; tax: number }>();
    for (const o of orders) {
      const giftSold = o.items.filter((i) => i.isGiftCard).reduce((s, i) => s + i.priceCents * (i.quantity - i.refundedQuantity), 0);
      const ttc = Math.max(0, o.totalCents + o.giftCardCents - o.refundedCents - giftSold);
      const k = `${month(o.createdAt)}|${o.taxRateBps}`;
      const c = map.get(k) ?? { ttc: 0, tax: 0 };
      c.ttc += ttc; c.tax += includedTax(ttc, o.taxRateBps);
      map.set(k, c);
    }
    const rows = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => { const [m, bps] = k.split("|"); const [y, mo] = m.split("-"); return [`${mo}/${y}`, Number(bps) ? rateLabel(Number(bps)) : "Sans TVA", c.ttc - c.tax, c.tax, c.ttc]; });
    return { columns: [{ label: "Mois" }, { label: "Taux" }, { label: "Base HT", money: true }, { label: "TVA", money: true }, { label: "TTC", money: true }], rows, totals: ["Total", "", sum(rows, 2), sum(rows, 3), sum(rows, 4)] };
  }

  // Meilleurs clients
  const map = new Map<string, { name: string; n: number; net: number; last: Date }>();
  for (const o of orders) { const c = map.get(o.email) ?? { name: o.name, n: 0, net: 0, last: o.createdAt }; c.n++; c.net += o.totalCents + o.giftCardCents - o.refundedCents; if (o.createdAt > c.last) c.last = o.createdAt; map.set(o.email, c); }
  const rows = [...map.entries()].sort((a, b) => b[1].net - a[1].net).slice(0, 200).map(([email, c]) => [c.name, email, c.n, c.net, day(c.last).split("-").reverse().join("/")]);
  return { columns: [{ label: "Client" }, { label: "E-mail" }, { label: "Commandes", num: true }, { label: "Montant dépensé", money: true }, { label: "Dernière commande" }], rows, totals: null };
}
