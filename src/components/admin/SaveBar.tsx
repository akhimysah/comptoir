"use client";

/** Barre d'enregistrement contextuelle, comme dans l'admin Shopify : elle recouvre la barre du haut tant qu'il y a des changements. */
export function SaveBar({ visible, message, pending, error, onDiscard, saveLabel = "Enregistrer" }: {
  visible: boolean;
  message: string;
  pending?: boolean;
  error?: string | null;
  onDiscard: () => void;
  saveLabel?: string;
}) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 bg-topbar px-4 text-white shadow-[0_2px_8px_rgba(0,0,0,.3)]" role="region" aria-label="Changements non enregistrés">
      <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-[#e3e3e3]" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="10" cy="10" r="7" /><path d="M10 6.5v4M10 13.5h.01" strokeLinecap="round" /></svg>
      <span className="truncate text-[13px] font-[550]">{error ? <span className="text-[#fda4a4]">{error}</span> : message}</span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onDiscard} className="h-8 rounded-lg bg-[#303030] px-3 text-[13px] font-[550] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)] hover:bg-[#3d3d3d]">Ignorer</button>
        <button type="submit" disabled={pending} className="h-8 rounded-lg bg-white px-3 text-[13px] font-[550] text-ink hover:bg-[#f1f1f1] disabled:opacity-60">{pending ? "Enregistrement…" : saveLabel}</button>
      </div>
    </div>
  );
}
