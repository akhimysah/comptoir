import { cx, initials } from "@/lib/utils";

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "attention";
// Couleurs des badges de l'admin Shopify (Polaris).
const TONES: Record<Tone, string> = {
  ok: "bg-[#cdfee1] text-[#0c5132]",
  attention: "bg-[#ffeb78] text-[#4f4700]",
  warn: "bg-[#ffd6a4] text-[#5e4200]",
  bad: "bg-[#fedad9] text-[#8e0b21]",
  info: "bg-[#e0f0ff] text-[#00527c]",
  neutral: "bg-[rgba(0,0,0,.06)] text-[#616161]",
};

export function Pill({ tone = "neutral", children, dot = true }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-[550]", TONES[tone])}>
      {dot && <span className={cx("h-2 w-2 rounded-full border-[1.5px] border-current", tone === "ok" || tone === "neutral" ? "bg-current" : "bg-transparent")} />}
      {children}
    </span>
  );
}

/** Photo du produit, ou visuel coloré avec ses initiales quand il n'y en a pas. */
export function Thumb({ image, hue, title, className, rounded = "rounded-lg" }: { image?: string | null; hue: number; title: string; className?: string; rounded?: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={cx("shrink-0 object-cover", rounded, className)} />;
  }
  return (
    <div
      aria-hidden
      className={cx("relative grid shrink-0 place-items-center overflow-hidden font-display font-bold", rounded, className)}
      style={{ background: `linear-gradient(140deg, hsl(${hue} 42% 80%), hsl(${hue + 30} 44% 58%))`, color: `hsl(${hue} 50% 18%)` }}
    >
      <span className="relative z-[1]">{initials(title)}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <a href={back} aria-label="Retour" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#e3e3e3] hover:text-ink">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5 6.5 10l5.5 5.5" /></svg>
          </a>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-7">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
      <svg viewBox="0 0 60 60" className="mb-2 h-16 w-16 text-[#d4d4d4]" fill="none" stroke="currentColor" strokeWidth={2}><rect x="10" y="14" width="40" height="32" rx="5" /><path d="M10 24h40M18 34h12" /></svg>
      {title && <h2 className="text-sm font-[650]">{title}</h2>}
      <p className="max-w-[44ch] text-[13px] text-muted">{children}</p>
      {action}
    </div>
  );
}
