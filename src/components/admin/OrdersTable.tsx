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
};

export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (action: "fulfill" | "unfulfill" | "markPaid") =>
    start(async () => {
      const { count } = await bulkOrders([...selected], action);
      setNotice(count ? `${count} commande${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour` : "Aucune commande sélectionnée n'était concernée.");
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div className="overflow-x-auto">
      {notice && <div role="status" className="border-b border-line bg-[#f7f7f7] px-4 py-2 text-[13px]">{notice} <button className="ml-2 text-pine hover:underline" onClick={() => setNotice(null)}>Fermer</button></div>}
      <table className="w-full">
        <thead>
          {selected.size > 0 ? (
            <tr>
              <th className="th w-8"><input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Tout sélectionner" className="h-4 w-4 accent-[#303030]" /></th>
              <th className="th" colSpan={7}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("fulfill")}>Marquer comme traitées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("unfulfill")}>Marquer comme non traitées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("markPaid")}>Marquer comme payées</button>
                </div>
              </th>
            </tr>
          ) : (
            <tr>
              <th className="th w-8"><input type="checkbox" checked={false} onChange={() => setSelected(new Set(rows.map((r) => r.id)))} aria-label="Tout sélectionner" className="h-4 w-4 accent-[#303030]" /></th>
              <th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th text-right">Total</th><th className="th">Statut du paiement</th><th className="th">Statut du traitement</th><th className="th hidden md:table-cell">Articles</th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className={selected.has(o.id) ? "bg-[#f1f1f1]" : "hover:bg-[#f7f7f7]"}>
              <td className="td"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Sélectionner #${o.number}`} className="h-4 w-4 accent-[#303030]" /></td>
              <td className="td whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-[650] hover:underline">#{o.number}</Link>{o.manual && <span className="ml-1.5 text-xs text-muted">manuelle</span>}</td>
              <td className="td whitespace-nowrap text-muted">{o.date}</td>
              <td className="td">{o.name}</td>
              <td className="td num whitespace-nowrap text-right">{o.total}</td>
              <td className="td">{o.payment ? <Pill tone={o.payment.tone}>{o.payment.label}</Pill> : <Pill>Annulée</Pill>}</td>
              <td className="td">{o.fulfillment && <Pill tone={o.fulfillment.tone}>{o.fulfillment.label}</Pill>}</td>
              <td className="td num hidden text-muted md:table-cell">{o.items} article{o.items > 1 ? "s" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
