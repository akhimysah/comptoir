"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Bouton menu du téléphone : affiche ou masque la barre latérale. */
export function MobileNavToggle() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.getElementById("admin-nav")?.setAttribute("data-open", String(open)); }, [open]);
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className="grid h-8 w-8 place-items-center rounded-lg text-white hover:bg-[#303030] md:hidden" aria-label="Menu" aria-expanded={open}>
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></svg>
    </button>
  );
}
