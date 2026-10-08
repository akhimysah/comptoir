import { cx, initials } from "@/lib/utils";

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
const TONES: Record<Tone, string> = {
  ok: "bg-[#DBEFE2] text-[#2C7A4C]",
  warn: "bg-[#FAEAC6] text-[#8F5B00]",
  bad: "bg-[#F6DADA] text-[#B13838]",
  info: "bg-[#DBE6F6] text-[#2A5BA6]",
  neutral: "bg-[#E3EAE5] text-muted",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
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

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      {title && <h2 className="text-lg font-bold">{title}</h2>}
      <p className="max-w-[44ch] text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}
