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
      <ul className="md:hidden">
        {rows.map((o) => (
          <li key={o.id} className={`flex gap-3 border-b border-line px-3 py-3 last:border-0 ${selected.has(o.id) ? "bg-[#f1f1f1]" : ""}`}>
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Sélectionner #${o.number}`} className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]" />
            <Link href={`/admin/orders/${o.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex justify-between gap-2"><span className="truncate"><b>#{o.number}</b> · {o.name}</span><span className="num shrink-0">{o.total}</span></span>
              <span className="text-xs text-muted">{o.date} · {o.items} article{o.items > 1 ? "s" : ""}</span>
              <span className="flex flex-wrap gap-1">{o.payment ? <Pill tone={o.payment.tone}>{o.payment.label}</Pill> : <Pill>Annulée</Pill>}{o.fulfillment && <Pill tone={o.fulfillment.tone}>{o.fulfillment.label}</Pill>}</span>
            </Link>
          </li>
        ))}
      </ul>
      {selected.size > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-2 md:hidden">
          <span className="text-[13px] font-[550]">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <button className="btn btn-sm" disabled={pending} onClick={() => run("fulfill")}>Traitées</button>
          <button className="btn btn-sm" disabled={pending} onClick={() => run("markPaid")}>Payées</button>
        </div>
      )}
      <table className="hidden w-full md:table">
        <thead>
          {selected.size > 0 ? (
            <tr>
              <th className="th w-8"><input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Tout sélectionner" className="h-4 w-4 accent-[#7c3aed]" /></th>
              <th className="th" colSpan={7}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("fulfill")}>Marquer comme traitées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("unfulfill")}>Marquer comme non traitées</button>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run("markPaid")}>Marquer comme payées</button>
                  <a className="btn btn-sm" href={`/print/packing?ids=${[...selected].join(",")}`} target="_blank">Imprimer les bons de préparation</a>
                </div>
              </th>
            </tr>
          ) : (
            <tr>
              <th className="th w-8"><input type="checkbox" checked={false} onChange={() => setSelected(new Set(rows.map((r) => r.id)))} aria-label="Tout sélectionner" className="h-4 w-4 accent-[#7c3aed]" /></th>
              <th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th text-right">Total</th><th className="th">Statut du paiement</th><th className="th">Statut du traitement</th><th className="th hidden md:table-cell">Articles</th>
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
