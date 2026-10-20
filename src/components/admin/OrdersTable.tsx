"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkOrders } from "@/app/admin/orders/actions";
import { Pill } from "@/components/ui";

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "attention";
export type OrderRow = {
  id: string;
  number: number;
  date: string;
  name: string;
  total: string;
  payment: { label: string; tone: Tone } | null;
  fulfillment: { label: string; tone: Tone } | null;
  items: number;
  manual: boolean;
  channel: string;
  tags: string[];
  /** « Traiter avant le » : déjà formaté côté serveur (la date du jour est celle du serveur). */
  fulfillBy: { label: string; overdue: boolean } | null;
  delivery: { label: string; tone: Tone } | null;
  shippingMode: string;
  risk: { level: "medium" | "high"; label: string } | null;
};

type Action = "fulfill" | "unfulfill" | "markPaid" | "deliver" | "archive";

export function OrdersTable({ rows, archivedTab = false }: { rows: OrderRow[]; archivedTab?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (action: Action) =>
    start(async () => {
      const { count } = await bulkOrders([...selected], action);
      setNotice(count ? `${count} commande${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour` : "Aucune commande sélectionnée n'était concernée.");
      setSelected(new Set());
      router.refresh();
    });
  const tagChips = (o: OrderRow) => o.tags.map((t) => <Link key={t} href={`/admin/orders?tag=${encodeURIComponent(t)}`} className="rounded-md bg-[#ebebeb] px-1.5 text-[11px] font-[550] hover:bg-[#e3e3e3]">{t}</Link>);
  const fulfillBy = (o: OrderRow) => (o.fulfillBy ? <span className={o.fulfillBy.overdue ? "font-[550] text-[#8e0b21]" : ""}>{o.fulfillBy.label}</span> : null);
  const riskDot = (o: OrderRow) => (o.risk ? <span title={o.risk.label} aria-label={o.risk.label} className={`inline-block h-2.5 w-2.5 rounded-full ${o.risk.level === "high" ? "bg-[#e51c00]" : "bg-[#ffb800]"}`} /> : null);

  return (
    <div className="overflow-x-auto">
      {notice && <div role="status" className="border-b border-line bg-[#f7f7f7] px-4 py-2 text-[13px]">{notice} <button className="ml-2 text-pine hover:underline" onClick={() => setNotice(null)}>Fermer</button></div>}
      <ul className="md:hidden">
        {rows.map((o) => (
          <li key={o.id} className={`flex gap-3 border-b border-line px-3 py-3 last:border-0 ${selected.has(o.id) ? "bg-[#f1f1f1]" : ""}`}>
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Sélectionner #${o.number}`} className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]" />
            <Link href={`/admin/orders/${o.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex justify-between gap-2"><span className="truncate"><b>#{o.number}</b> · {o.name} {riskDot(o)}</span><span className="num shrink-0">{o.total}</span></span>
              <span className="text-xs text-muted">{o.date} · {o.items} article{o.items > 1 ? "s" : ""} · {o.channel}{o.fulfillBy ? <> · Traiter avant : {fulfillBy(o)}</> : null}</span>
              <span className="flex flex-wrap gap-1">{o.payment ? <Pill tone={o.payment.tone}>{o.payment.label}</Pill> : <Pill>Annulée</Pill>}{o.fulfillment && <Pill tone={o.fulfillment.tone}>{o.fulfillment.label}</Pill>}{o.delivery && <Pill tone={o.delivery.tone}>{o.delivery.label}</Pill>}{tagChips(o)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {selected.size > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-2 md:hidden">
          <span className="text-[13px] font-[550]">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <button className="btn btn-sm" disabled={pending} onClick={() => run("fulfill")}>Traitées</button>
          <button className="btn btn-sm" disabled={pending} onClick={() => run("deliver")}>Livrées</button>
          <button className="btn btn-sm" disabled={pending} onClick={() => run("markPaid")}>Payées</button>
          {!archivedTab && <button className="btn btn-sm" disabled={pending} onClick={() => run("archive")}>Archiver</button>}
        </div>
      )}
      <table className="hidden w-full md:table">
        <thead>
          {selected.size > 0 ? (
            <tr>
              <th className="th w-8"><input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Tout sélectionner" className="h-4 w-4 accent-[#7c3aed]" /></th>
              <th className="th" colSpan={13}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("fulfill")}>Marquer comme traitées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("unfulfill")}>Marquer comme non traitées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("deliver")}>Marquer comme livrées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("markPaid")}>Marquer comme payées</button>
                  {!archivedTab && <button className="btn btn-sm" disabled={pending} onClick={() => run("archive")}>Archiver</button>}
                  <a className="btn btn-sm" href={`/print/packing?ids=${[...selected].join(",")}`} target="_blank">Imprimer les bons de préparation</a>
                </div>
              </th>
            </tr>
          ) : (
            <tr>
              <th className="th w-8"><input type="checkbox" checked={false} onChange={() => setSelected(new Set(rows.map((r) => r.id)))} aria-label="Tout sélectionner" className="h-4 w-4 accent-[#7c3aed]" /></th>
              <th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th">Canal</th><th className="th text-right">Total</th><th className="th">Statut du paiement</th><th className="th">Statut du traitement</th><th className="th">Statut de la livraison</th><th className="th">Traiter avant le</th><th className="th hidden lg:table-cell">Mode de livraison</th><th className="th hidden md:table-cell">Articles</th><th className="th">Balises</th><th className="th" title="Indicateurs">Ind.</th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className={selected.has(o.id) ? "bg-[#f1f1f1]" : "hover:bg-[#f7f7f7]"}>
              <td className="td"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Sélectionner #${o.number}`} className="h-4 w-4 accent-[#7c3aed]" /></td>
              <td className="td whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-[650] hover:underline">#{o.number}</Link>{o.manual && <span className="ml-1.5 text-xs text-muted">manuelle</span>}</td>
              <td className="td whitespace-nowrap text-muted">{o.date}</td>
              <td className="td">{o.name}</td>
              <td className="td whitespace-nowrap text-muted">{o.channel}</td>
              <td className="td num whitespace-nowrap text-right">{o.total}</td>
              <td className="td">{o.payment ? <Pill tone={o.payment.tone}>{o.payment.label}</Pill> : <Pill>Annulée</Pill>}</td>
              <td className="td">{o.fulfillment && <Pill tone={o.fulfillment.tone}>{o.fulfillment.label}</Pill>}</td>
              <td className="td">{o.delivery && <Pill tone={o.delivery.tone}>{o.delivery.label}</Pill>}</td>
              <td className="td whitespace-nowrap">{fulfillBy(o)}</td>
              <td className="td hidden whitespace-nowrap text-muted lg:table-cell">{o.shippingMode}</td>
              <td className="td num hidden text-muted md:table-cell">{o.items} article{o.items > 1 ? "s" : ""}</td>
              <td className="td"><span className="flex flex-wrap gap-1">{tagChips(o)}</span></td>
              <td className="td">{riskDot(o)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
