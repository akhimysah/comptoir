import Link from "next/link";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { LiveGlobe, type GlobePoint } from "@/components/admin/LiveGlobe";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { COUNTRY_CENTER } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { liveVisitors, LIVE_WINDOW_MS } from "@/lib/traffic";
import { cx } from "@/lib/utils";

export const metadata = { title: "Vue en direct" };
export const dynamic = "force-dynamic";

/** Vue en direct (comme Shopify) : visiteurs présents, pages regardées, paniers en cours, ventes du jour. Se rafraîchit toute seule. */
export default async function LivePage() {
  const { store } = await requirePerm("analytics");
  const [live, todayOrders, lastHour] = await Promise.all([
    liveVisitors(store.id),
    db.order.findMany({ where: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, select: { totalCents: true, refundedCents: true, createdAt: true, address: true } }),
    db.pageView.count({ where: { storeId: store.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  const withCart = live.filter((v) => v.cartItems > 0);
  const pages = new Map<string, number>();
  for (const v of live) pages.set(v.path, (pages.get(v.path) ?? 0) + 1);
  const minutes = Array.from({ length: 10 }, (_, i) => { const from = Date.now() - (10 - i) * 60_000; return live.filter((v) => v.lastSeenAt.getTime() >= from && v.lastSeenAt.getTime() < from + 60_000).length; });
  const m = (c: number) => formatMoney(c, store.currency);
  // Points du globe : visiteurs présents (position approximative d'après l'IP) et commandes de la journée (pays de livraison).
  const points: GlobePoint[] = [];
  let unknown = 0;
  for (const v of live) { if (v.lat != null && v.lng != null) points.push({ lat: v.lat, lng: v.lng, kind: "visitor", label: [v.city, v.country].filter(Boolean).join(", "), at: v.lastSeenAt.getTime() }); else unknown++; }
  for (const o of todayOrders) {
    let country = "";
    try { country = String((JSON.parse(o.address || "{}") as { country?: string }).country ?? ""); } catch {}
    const c = COUNTRY_CENTER[country];
    if (c) points.push({ lat: c[1], lng: c[0], kind: "order", label: country, at: o.createdAt.getTime() });
  }
  const places = new Map<string, number>();
  for (const v of live) { const k = [v.city, v.country].filter(Boolean).join(", ") || "Lieu inconnu"; places.set(k, (places.get(k) ?? 0) + 1); }
  const salesToday = todayOrders.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const label = (path: string) => {
    const rest = path.replace(`/s/${store.slug}`, "") || "/";
    if (rest === "/") return "Accueil";
    if (rest.startsWith("/p/")) return `Produit · ${rest.slice(3)}`;
    if (rest.startsWith("/c/")) return `Collection · ${rest.slice(3)}`;
    if (rest === "/cart") return "Panier";
    if (rest === "/products") return "Tous les produits";
    if (rest.startsWith("/search")) return "Recherche";
    return rest;
  };

  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader back="/admin/analytics" title="Vue en direct" subtitle={`Ce qui se passe sur votre boutique en ce moment (visiteurs actifs dans les ${LIVE_WINDOW_MS / 60_000} dernières minutes). La page se rafraîchit toutes les 20 secondes.`} actions={<Link href={`/s/${store.slug}`} target="_blank" className="btn">Voir la boutique</Link>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Visiteurs en ce moment", String(live.length), "actifs dans les 5 dernières minutes"],
          ["Paniers en cours", String(withCart.length), `${withCart.reduce((s, v) => s + v.cartItems, 0)} article(s) au total`],
          ["Ventes du jour", m(salesToday), `${todayOrders.length} commande${todayOrders.length > 1 ? "s" : ""} depuis minuit`],
          ["Pages vues (1 h)", String(lastHour), "sur la dernière heure"],
        ].map(([k, v, h]) => (
          <div key={k} className="card p-4"><div className="text-xs font-[550] text-muted">{k}</div><div className="text-2xl font-bold tabular-nums">{v}</div><div className="text-xs text-muted">{h}</div></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="card flex flex-col items-center p-4">
          <LiveGlobe points={points} />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#4cc9ff]" />Visiteur en ce moment</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />Commande du jour</span>
            {unknown > 0 && <span>{unknown} visiteur{unknown > 1 ? "s" : ""} sans position connue</span>}
          </div>
          <p className="mt-1 text-center text-[11px] text-muted">Position approximative d'après l'adresse IP (ville ou pays), fournie par l'hébergeur. Faites tourner le globe à la souris.</p>
        </section>
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">D'où viennent les visiteurs</h2></div>
          {places.size ? (
            <ul>{[...places].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => <li key={k} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0"><span className="truncate">{k}</span><span className="num text-muted">{n}</span></li>)}</ul>
          ) : (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Personne sur la boutique en ce moment.</p>
          )}
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-[650]">Visiteurs par minute (10 dernières minutes)</h2>
          <div className="flex h-28 items-end gap-1.5">
            {minutes.map((n, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1"><div className={cx("w-full rounded-t bg-[#2c6ecb]", !n && "bg-[#e3e3e3]")} style={{ height: `${Math.max(4, (n / Math.max(1, ...minutes)) * 100)}%` }} /><span className="text-[10px] text-muted">{n}</span></div>)}
          </div>
        </section>
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Pages regardées en ce moment</h2></div>
          {pages.size ? (
            <ul>{[...pages].sort((a, b) => b[1] - a[1]).map(([path, n]) => <li key={path} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0"><a href={path} target="_blank" className="truncate hover:underline">{label(path)}</a><span className="num text-muted">{n}</span></li>)}</ul>
          ) : (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Personne sur la boutique en ce moment. Les visiteurs apparaissent ici dès qu'ils ouvrent une page.</p>
          )}
        </section>
      </div>
    </>
  );
}
