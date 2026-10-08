import Link from "next/link";
import { Empty, PageHeader, Pill, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/orders";
import { stripeConfigured } from "@/lib/stripe";
import { formatDateTime, parseJson } from "@/lib/utils";

const DAYS = 30;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { user, store } = await requireStore();
  const since = new Date(Date.now() - DAYS * 86400_000);
  since.setHours(0, 0, 0, 0);

  const [paid, recent, lowStock, productCount] = await Promise.all([
    db.order.findMany({ where: { storeId: store.id, paymentStatus: "paid", cancelledAt: null, createdAt: { gte: since } }, select: { totalCents: true, createdAt: true } }),
    db.order.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 6, include: { items: true } }),
    db.variant.findMany({ where: { stock: { lte: 5 }, product: { storeId: store.id, status: "active" } }, include: { product: true }, orderBy: { stock: "asc" }, take: 6 }),
    db.product.count({ where: { storeId: store.id } }),
  ]);

  const revenue = paid.reduce((s, o) => s + o.totalCents, 0);
  const aov = paid.length ? Math.round(revenue / paid.length) : 0;

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    return { d, v: 0 };
  });
  for (const o of paid) {
    const i = Math.floor((o.createdAt.getTime() - since.getTime()) / 86400_000);
    if (days[i]) days[i].v += o.totalCents;
  }

  const firstName = user.name.split(" ")[0];
  const checklist = [
    { done: productCount > 0, label: "Ajouter un premier produit", href: "/admin/products/new" },
    { done: Boolean(store.themeUpdatedAt), label: "Personnaliser le thème", href: "/admin/theme" },
    { done: store.stripeChargesEnabled, label: "Activer le paiement par carte", href: "/admin/settings#paiements" },
  ];

  return (
    <>
      <PageHeader
        title={welcome ? `Bienvenue, ${firstName} !` : `Bonjour ${firstName}`}
        subtitle={<>Votre boutique est en ligne à l'adresse <Link className="font-mono text-pine underline" href={`/s/${store.slug}`} target="_blank">/s/{store.slug}</Link></>}
        actions={<Link href="/admin/products/new" className="btn btn-primary">Ajouter un produit</Link>}
      />

      {checklist.some((c) => !c.done) && (
        <div className="card p-5">
          <h2 className="text-lg font-bold">Pour bien démarrer</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                <span className={`grid h-5 w-5 place-items-center rounded-full border text-[0.7rem] ${c.done ? "border-pine bg-pine text-white" : "border-line"}`}>{c.done ? "✓" : ""}</span>
                {c.done ? <span className="text-muted line-through">{c.label}</span> : <Link href={c.href} className="font-semibold text-pine hover:underline">{c.label}</Link>}
              </li>
            ))}
          </ul>
          {!stripeConfigured() && <p className="mt-3 text-xs text-muted">Stripe n'est pas encore configuré sur la plateforme : les commandes passent en paiement de démonstration.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-line gap-px lg:grid-cols-4">
        {[
          ["Ventes (30 j)", formatMoney(revenue, store.currency), "commandes payées"],
          ["Commandes (30 j)", String(paid.length), "payées"],
          ["Panier moyen", formatMoney(aov, store.currency), "par commande"],
          ["Stock faible", String(lowStock.length), "variantes à 5 ou moins"],
        ].map(([k, v, d]) => (
          <div key={k} className="flex flex-col gap-1 bg-white px-5 py-4">
            <span className="eyebrow">{k}</span>
            <span className="num font-display text-2xl font-bold">{v}</span>
            <span className="text-xs text-muted">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="card min-w-0">
          <div className="card-h"><h2 className="text-base font-bold">Ventes par jour</h2><span className="num text-sm text-muted">{formatMoney(revenue, store.currency)}</span></div>
          <div className="p-5"><SalesChart days={days} currency={store.currency} /></div>
        </div>
        <div className="card min-w-0">
          <div className="card-h"><h2 className="text-base font-bold">Stock faible</h2><Link href="/admin/products" className="text-sm font-semibold text-pine">Produits</Link></div>
          {lowStock.length ? (
            <ul>
              {lowStock.map((v) => (
                <li key={v.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0">
                  <Thumb image={parseJson<string[]>(v.product.images, [])[0]} hue={v.product.hue} title={v.product.title} className="h-9 w-9 text-xs" />
                  <Link href={`/admin/products/${v.productId}`} className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-semibold">{v.product.title}</div>
                    {v.title !== "Par défaut" && <div className="truncate text-xs text-muted">{v.title}</div>}
                  </Link>
                  {v.stock <= 0 ? <Pill tone="bad">Rupture</Pill> : <Pill tone="warn">{v.stock} restants</Pill>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Tout votre catalogue en ligne a plus de 5 unités en stock.</Empty>
          )}
        </div>
      </div>

      <div className="card min-w-0">
        <div className="card-h"><h2 className="text-base font-bold">Dernières commandes</h2><Link href="/admin/orders" className="text-sm font-semibold text-pine">Toutes les commandes</Link></div>
        {recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="hover:bg-[#F3F6F4]">
                    <td className="td"><Link href={`/admin/orders/${o.id}`} className="num font-semibold">#{o.number}</Link></td>
                    <td className="td text-muted">{formatDateTime(o.createdAt)}</td>
                    <td className="td">{o.name}</td>
                    <td className="td">{o.cancelledAt ? <Pill tone="bad">Annulée</Pill> : <Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill>}</td>
                    <td className="td hidden sm:table-cell">{!o.cancelledAt && o.paymentStatus === "paid" && <Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill>}</td>
                    <td className="td num text-right">{formatMoney(o.totalCents, store.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Aucune commande pour l'instant. Partagez l'adresse de votre boutique : chaque achat apparaîtra ici.</Empty>
        )}
      </div>
    </>
  );
}

function SalesChart({ days, currency }: { days: { d: Date; v: number }[]; currency: string }) {
  const W = 640, H = 200, L = 56, R = 8, T = 10, B = 24;
  const raw = Math.max(...days.map((d) => d.v), 100);
  const steps = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 500000, 1000000];
  const step = steps.find((s) => s * 4 >= raw) ?? Math.ceil(raw / 4);
  const max = step * 4;
  const bw = (W - L - R) / days.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const short = (c: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(c / 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ventes par jour sur 30 jours">
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y(k * step)} y2={y(k * step)} stroke="#D3DCD6" />
          <text x={L - 8} y={y(k * step) + 4} textAnchor="end" className="fill-muted font-mono text-[10px]">{short(k * step)}</text>
        </g>
      ))}
      {days.map((d, i) => (
        <rect key={i} x={L + i * bw + bw * 0.18} width={bw * 0.64} y={y(d.v)} height={Math.max(0, y(0) - y(d.v))} rx={2} fill={i === days.length - 1 ? "#1F6F5C" : "#8FC2B1"}>
          <title>{`${d.d.toLocaleDateString("fr-FR")} : ${short(d.v)}`}</title>
        </rect>
      ))}
      {days.map((d, i) =>
        i % 7 === 0 || i === days.length - 1 ? (
          <text key={`l${i}`} x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted font-mono text-[10px]">
            {i === days.length - 1 ? "auj." : d.d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}
