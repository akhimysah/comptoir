import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { archiveFinishedOrders } from "./actions";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { type Channel, CHANNELS, channelPaymentMethods, deliveryStatus, fulfillByLabel, fulfillByOf, orderChannel, shippingModeLabel, splitOrderTags } from "@/components/admin/OrderSummary";
import { Empty, PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, paymentLabel } from "@/lib/orders";
import { isRiskLevel, RISK_LABELS } from "@/lib/risk";
import { cx, formatDateTime } from "@/lib/utils";
import { listViews } from "@/lib/saved-views-data";
import { SavedViews } from "@/components/admin/SavedViews";

const TABS = [
  { key: "all", label: "Toutes" },
  { key: "toship", label: "Non traitées" },
  { key: "unpaid", label: "Non payées" },
  { key: "overdue", label: "En retard" },
  { key: "shipped", label: "Traitées" },
  { key: "cancelled", label: "Annulées" },
  { key: "archived", label: "Archivées" },
] as const;

/** Les commandes archivées n'apparaissent que dans leur onglet. */
function filter(storeId: string, tab: string): Prisma.OrderWhereInput {
  switch (tab) {
    case "toship": return { storeId, archivedAt: null, OR: [{ paymentStatus: { in: ["paid", "partially_refunded"] } }, { paymentStatus: "pending", dueAt: { not: null } }], fulfillmentStatus: "unfulfilled", cancelledAt: null };
    case "unpaid": return { storeId, archivedAt: null, paymentStatus: "pending", cancelledAt: null };
    case "overdue": return { storeId, archivedAt: null, paymentStatus: "pending", dueAt: { lt: new Date() }, cancelledAt: null };
    case "shipped": return { storeId, archivedAt: null, fulfillmentStatus: "fulfilled", cancelledAt: null };
    case "cancelled": return { storeId, archivedAt: null, cancelledAt: { not: null } };
    case "archived": return { storeId, archivedAt: { not: null } };
    default: return { storeId, archivedAt: null };
  }
}

const isChannel = (c: string): c is Channel => Object.hasOwn(CHANNELS, c);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; tag?: string; channel?: string; view?: string }> }) {
  const sp = await searchParams;
  const { tab = "all", q = "" } = sp;
  const tag = (sp.tag ?? "").trim().toLowerCase();
  const channel = sp.channel && isChannel(sp.channel) ? sp.channel : null;
  const { store } = await requirePerm("orders");
  await archiveFinishedOrders();
  // Vues enregistrées : les filtres actifs (hors onglet par défaut) peuvent être gardés sous un nom.
  const views = await listViews(store.id, "orders");
  const currentQuery = new URLSearchParams(Object.entries({ tab: tab !== "all" ? tab : "", q, tag, channel: channel ?? "" }).filter(([, v]) => v)).toString();
  const counts = await Promise.all(TABS.map((t) => db.order.count({ where: filter(store.id, t.key) })));
  const n = Number(q.replace("#", ""));
  const found = await db.order.findMany({
    where: {
      AND: [
        filter(store.id, tab),
        q ? { OR: [{ name: textSearch(q) }, { email: textSearch(q) }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])] } : {},
        tag ? { tags: { contains: tag } } : {},
        channel ? { paymentMethod: { in: channelPaymentMethods(channel) } } : {},
      ],
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // « contains » attrape aussi « vip2 » pour « vip » : on garde les correspondances exactes.
  const orders = tag ? found.filter((o) => splitOrderTags(o.tags).includes(tag)) : found;
  const now = new Date();
  const query = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, q, tag, channel, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/orders${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Commandes" actions={<><a href="/admin/orders/export" className="btn">Exporter</a><Link href="/admin/orders/new" className="btn btn-primary">Créer une commande</Link></>} />
      <div className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          {TABS.map((t, i) => (
            <Link key={t.key} href={query({ tab: t.key })} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", tab === t.key ? "bg-[#e3e3e3] text-ink" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>
              {t.label}{t.key !== "all" && counts[i] > 0 && <span className="ml-1 text-xs tabular-nums text-muted">{counts[i]}</span>}
            </Link>
          ))}
          <SavedViews page="orders" basePath="/admin/orders" views={views} currentQuery={currentQuery} activeId={sp.view ?? null} />
          <form className="ml-auto flex items-center gap-1.5">
            <input type="hidden" name="tab" value={tab} />
            {tag && <input type="hidden" name="tag" value={tag} />}
            <select name="channel" defaultValue={channel ?? ""} className="input h-7 py-0 text-[13px]" aria-label="Canal">
              <option value="">Tous les canaux</option>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="q" defaultValue={q} className="input h-7 w-48 py-1" placeholder="Rechercher n°, nom, e-mail" aria-label="Rechercher une commande" />
            <button className="btn h-7 py-0">Filtrer</button>
          </form>
        </div>
        {(tag || channel) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[13px]">
            <span className="text-muted">Filtres :</span>
            {tag && <span className="inline-flex items-center gap-1 rounded-md bg-[#ebebeb] px-2 py-0.5 font-[550]">Balise : {tag} <Link href={query({ tag: null })} aria-label="Retirer le filtre balise" className="text-muted hover:text-ink">✕</Link></span>}
            {channel && <span className="inline-flex items-center gap-1 rounded-md bg-[#ebebeb] px-2 py-0.5 font-[550]">Canal : {CHANNELS[channel]} <Link href={query({ channel: null })} aria-label="Retirer le filtre canal" className="text-muted hover:text-ink">✕</Link></span>}
          </div>
        )}
        {orders.length ? (
          <OrdersTable
            archivedTab={tab === "archived"}
            rows={orders.map((o) => {
              const by = fulfillByOf(o, store.fulfillmentDays);
              return {
                id: o.id,
                number: o.number,
                date: formatDateTime(o.createdAt),
                name: o.name,
                total: formatMoney(o.totalCents, store.currency),
                payment: o.cancelledAt ? null : paymentLabel(o),
                fulfillment: o.cancelledAt ? null : FULFILLMENT_LABELS[o.fulfillmentStatus],
                items: o.items.reduce((s, i) => s + i.quantity, 0),
                manual: o.paymentMethod === "manual",
                channel: CHANNELS[orderChannel(o)],
                tags: splitOrderTags(o.tags),
                fulfillBy: by ? fulfillByLabel(by, now) : null,
                delivery: deliveryStatus(o),
                shippingMode: shippingModeLabel(o),
                risk: isRiskLevel(o.riskLevel) && o.riskLevel !== "low" ? { level: o.riskLevel, label: `Risque ${RISK_LABELS[o.riskLevel]}` } : null,
              };
            })}
          />
        ) : (
          <Empty>{counts[0] || tab !== "all" || tag || channel ? "Aucune commande ne correspond." : "Aucune commande pour l'instant. Elles arrivent ici dès qu'un client paie son panier."}</Empty>
        )}
      </div>
    </>
  );
}
