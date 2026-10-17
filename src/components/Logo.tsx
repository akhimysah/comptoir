/* eslint-disable @next/next/no-img-element */

/** Symbole de Revolution Ecom (point et barre en dégradé), avec le nom à côté si demandé. */
export function Logo({ size = 32, withName = true, className = "", nameClassName = "" }: { size?: number; withName?: boolean; className?: string; nameClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/brand/revolution-mark.svg" alt={withName ? "" : "Revolution Ecom"} width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
      {withName && <span className={`whitespace-nowrap font-extrabold uppercase tracking-tight ${nameClassName}`}>Revolution<span className="bg-gradient-to-r from-[#4f86ff] to-[#d98bf0] bg-clip-text text-transparent"> Ecom</span></span>}
    </span>
  );
}
