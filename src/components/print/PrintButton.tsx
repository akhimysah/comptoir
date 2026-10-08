"use client";

export function PrintButton({ label = "Imprimer / Enregistrer en PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#303030] px-4 py-2 text-sm font-semibold text-white print:hidden">
      {label}
    </button>
  );
}
