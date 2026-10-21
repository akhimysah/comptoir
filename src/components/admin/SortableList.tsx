"use client";

import { type ReactNode, useRef, useState } from "react";

/**
 * Liste réordonnable au pointeur (souris et doigt), comme les sections de l'éditeur Shopify :
 * on saisit la poignée, l'élément suit le pointeur, une ligne bleue montre où il sera déposé.
 * Indépendante du glisser-déposer natif du navigateur (fragile dès que la liste se re-rend).
 */
export function SortableList({ ids, onMove, children }: { ids: string[]; onMove: (from: number, to: number) => void; children: (id: string, handle: { onPointerDown: (e: React.PointerEvent) => void; className: string }, state: { dragging: boolean }) => ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDragState] = useState<{ from: number; to: number; y: number; offset: number } | null>(null);
  // Copie hors React : la fin du glissement lit l'état sans passer par un updater (que React peut appeler deux fois en développement).
  const live = useRef<typeof drag>(null);
  const setDrag = (d: typeof drag) => { live.current = d; setDragState(d); };
  const start = (from: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rows = rowRects();
    const row = rows[from];
    if (!row) return;
    const offset = e.clientY - row.top;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    setDrag({ from, to: from, y: e.clientY, offset });
    const move = (ev: PointerEvent) => {
      const r = rowRects();
      let to = r.length;
      for (let i = 0; i < r.length; i++) if (ev.clientY < r[i].top + r[i].height / 2) { to = i; break; }
      setDrag({ from, to, y: ev.clientY, offset });
      // Défilement automatique près des bords du panneau.
      const panel = root.current?.closest<HTMLElement>(".overflow-y-auto");
      if (panel) { const b = panel.getBoundingClientRect(); if (ev.clientY < b.top + 24) panel.scrollTop -= 8; else if (ev.clientY > b.bottom - 24) panel.scrollTop += 8; }
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      const d = live.current;
      setDrag(null);
      if (d) { const to = d.to > d.from ? d.to - 1 : d.to; if (to !== d.from) onMove(d.from, to); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const rowRects = () => Array.from(root.current?.querySelectorAll<HTMLElement>(":scope > [data-sortable-row]") ?? []).map((el) => el.getBoundingClientRect());
  const handle = (i: number) => ({ onPointerDown: start(i), className: "cursor-grab touch-none active:cursor-grabbing" });
  return (
    <div ref={root} className="relative">
      {ids.map((id, i) => (
        <div key={id} data-sortable-row className="relative" style={drag && drag.from === i ? { opacity: 0.35 } : undefined}>
          {drag && drag.to === i && drag.from !== i && <div className="pointer-events-none absolute -top-0.5 left-2 right-2 z-10 h-0.5 rounded bg-[#005bd3]" />}
          {children(id, handle(i), { dragging: Boolean(drag && drag.from === i) })}
        </div>
      ))}
      {drag && drag.to === ids.length && <div className="pointer-events-none relative left-2 right-2 h-0.5 rounded bg-[#005bd3]" style={{ width: "calc(100% - 16px)" }} />}
    </div>
  );
}
