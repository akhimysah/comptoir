import Link from "next/link";
import { PageHeader, Pill, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseJson } from "@/lib/utils";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { store, perms } = await requireStore();
  const term = q.trim();
  const n = Number(term.replace("#", ""));
  const [products, orders, customers] = term
    ? await Promise.all([
        perms.includes("products") ? db.product.findMany({ where: { storeId: store.id, title: { contains: term } }, take: 8 }) : [],
        !perms.includes("orders") ? [] : db.order.findMany({ where: { storeId: store.id, OR: [{ name: { contains: term } }, { email: { contains: term } }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])] }, orderBy: { createdAt: "desc" }, take: 8 }),
        perms.includes("customers") ? db.customer.findMany({ where: { storeId: store.id, OR: [{ name: { contains: term } }, { email: { contains: term } }] }, take: 8 }) : [],
      ])
    : [[], [], []];
  const none = term && !products.length && !orders.length && !customers.length;

  return (
    <>
      <PageHeader title={term ? `Résultats pour « ${term} »` : "Rechercher"} />
      {!term && <p className="text-muted">Tapez un nom de produit, un numéro de commande ou un client dans la barre du haut.</p>}
      {none && <div className="card px-4 py-10 text-center text-muted">Aucun résultat.</div>}
      {[
        { title: "Produits", items: products.map((p) => ({ href: `/admin/products/${p.id}`, left: <Thumb image={parseJson<string[]>(p.images, [])[0]} hue={p.hue} title={p.title} className="h-8 w-8 text-[10px]" />, label: p.title, right: p.status === "active" ? <Pill tone="ok">Actif</Pill> : <Pill>Brouillon</Pill> })) },
        { title: "Commandes", items: orders.map((o) => ({ href: `/admin/orders/${o.id}`, left: null, label: `#${o.number} · ${o.name}`, right: <span className="tabular-nums">{formatMoney(o.totalCents, store.currency)}</span> })) },
        { title: "Clients", items: customers.map((c) => ({ href: `/admin/customers`, left: null, label: `${c.name} · ${c.email}`, right: null })) },
      ].filter((g) => g.items.length).map((g) => (
        <section key={g.title} className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">{g.title}</h2></div>
          <ul>
            {g.items.map((it) => (
              <li key={it.href + it.label} className="border-b border-line last:border-0">
                <Link href={it.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7f7f7]">{it.left}<span className="flex-1 font-[550]">{it.label}</span>{it.right}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
