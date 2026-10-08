/* eslint-disable @next/next/no-img-element */

/** Marque « P » de Parnassa Pay, avec le nom à côté si demandé. */
export function Logo({ size = 32, withName = true, className = "", nameClassName = "" }: { size?: number; withName?: boolean; className?: string; nameClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/brand/parnassa-mark.jpg" alt={withName ? "" : "Parnassa Pay"} width={size} height={size} className="shrink-0 rounded-[22%]" style={{ width: size, height: size }} />
      {withName && <span className={`font-semibold tracking-tight ${nameClassName}`}>Parnassa <span className="text-[#a78bfa]">Pay</span></span>}
    </span>
  );
}
