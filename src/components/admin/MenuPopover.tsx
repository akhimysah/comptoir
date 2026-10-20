"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Menu « ⋯ » qui se place tout seul : collé au bouton, au-dessus s'il manque de place en dessous,
 * jamais coupé par un cadre (position fixe par rapport à la fenêtre). Se ferme au clic ailleurs ou avec Échap.
 */
export function MenuPopover({ label, children, buttonClassName = "btn h-8 w-8 px-0" }: { label: string; children: React.ReactNode; buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const place = () => {
      const b = button.current!.getBoundingClientRect();
      const p = panel.current!.getBoundingClientRect();
      const up = b.bottom + 6 + p.height > window.innerHeight && b.top - 6 - p.height > 0;
      setPos({ top: up ? b.top - 6 - p.height : b.bottom + 6, left: Math.max(8, Math.min(b.right - p.width, window.innerWidth - p.width - 8)), up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <>
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${buttonClassName} outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-1`}>⋯</button>
      {open && (
        <div ref={panel} role="menu" style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }} className="fixed z-50 w-64 rounded-xl border border-line bg-white p-1.5 text-ink shadow-[0_12px_32px_-12px_rgba(0,0,0,.3)]" onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("a, button[type=submit], button:not([data-keep])")) setOpen(false); }}>
          {children}
        </div>
      )}
    </>
  );
}
