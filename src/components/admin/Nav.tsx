"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const ICONS: Record<string, string> = {
  home: "M4 9.5 10 4.5l6 5V16a.5.5 0 0 1-.5.5H12v-4H8v4H4.5A.5.5 0 0 1 4 16z",
  orders: "M5 4.5h10l.5 3h-11zM4.5 7.5h11V15a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 15zM8 10.5h4",
  products: "M10 3.5 16 6.5v7L10 16.5 4 13.5v-7zM4 6.5l6 3 6-3M10 9.5v7",
  customers: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4.5 16.5a5.5 5.5 0 0 1 11 0",
  discounts: "M10.6 3.5H15a1.5 1.5 0 0 1 1.5 1.5v4.4a1.5 1.5 0 0 1-.44 1.06l-5.6 5.6a1.5 1.5 0 0 1-2.12 0L4 11.68a1.5 1.5 0 0 1 0-2.12l5.6-5.6a1.5 1.5 0 0 1 1-.46zM13 7h.01",
  store: "M4 8 5 4.5h10L16 8M4 8h12v1a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0zM5 10.5v6h10v-6",
  eye: "M2.5 10S5 5 10 5s7.5 5 7.5 5-2.5 5-7.5 5-7.5-5-7.5-5zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  settings: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15.5 10a5.5 5.5 0 0 0-.08-.92l1.58-1.24-1.5-2.6-1.88.75a5.5 5.5 0 0 0-1.6-.92L11.75 3h-3l-.27 2.07a5.5 5.5 0 0 0-1.6.92L5 5.24l-1.5 2.6 1.58 1.24a5.5 5.5 0 0 0 0 1.84L3.5 12.16l1.5 2.6 1.88-.75a5.5 5.5 0 0 0 1.6.92L8.75 17h3l.27-2.07a5.5 5.5 0 0 0 1.6-.92l1.88.75 1.5-2.6-1.58-1.24c.05-.3.08-.6.08-.92z",
  search: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM17 17l-3.75-3.75",
  chart: "M4 16V9M8.5 16V4.5M13 16v-5M17 16V7.5M3 16.5h14.5",
  stores: "M3.5 8.5 4.5 4h11l1 4.5M3.5 8.5h13M4.5 8.5V16h11V8.5M8 16v-4h4v4",
  bell: "M10 3.5a4.5 4.5 0 0 0-4.5 4.5v3L4 13.5h12L14.5 11V8A4.5 4.5 0 0 0 10 3.5zM8.5 16a1.5 1.5 0 0 0 3 0",
  plus: "M10 4.5v11M4.5 10h11",
  back: "M12 4.5 6.5 10l5.5 5.5",
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={cx("shrink-0", className)} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

type Item = { href: string; label: string; icon?: string; badge?: number; children?: { href: string; label: string }[]; match?: string[] };

function NavLink({ item, path }: { item: Item; path: string }) {
  const prefixes = item.match ?? [item.href];
  const inSection = item.href === "/admin" ? path === "/admin" : prefixes.some((p) => path.startsWith(p));
  const childActive = item.children?.some((c) => path.startsWith(c.href));
  const active = inSection && !childActive;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-[550] transition",
          active ? "bg-white text-ink shadow-[0_1px_0_rgba(0,0,0,.05)]" : inSection ? "text-ink" : "text-[#303030] hover:bg-[#f1f1f1]",
        )}
      >
        {item.icon && <Icon name={item.icon} className={cx("h-5 w-5", active || inSection ? "text-ink" : "text-[#4a4a4a]")} />}
        <span className="flex-1 truncate">{item.label}</span>
        {!!item.badge && <span className="rounded-md bg-[#e3e3e3] px-1.5 text-xs font-[550] tabular-nums">{item.badge}</span>}
      </Link>
      {inSection && item.children && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {item.children.map((c) => {
            const on = path.startsWith(c.href);
            return (
              <li key={c.href}>
                <Link href={c.href} aria-current={on ? "page" : undefined} className={cx("flex h-7 items-center rounded-lg pl-9 pr-2 text-[13px]", on ? "bg-white font-[550] text-ink" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function AdminNav({ toShip, storeSlug, isOwner, storeCount }: { toShip: number; storeSlug: string; isOwner: boolean; storeCount: number }) {
  const path = usePathname();
  const main: Item[] = [
    { href: "/admin", label: "Accueil", icon: "home" },
    { href: "/admin/orders", label: "Commandes", icon: "orders", badge: toShip, match: ["/admin/orders", "/admin/checkouts"], children: [{ href: "/admin/checkouts", label: "Paniers abandonnés" }] },
    { href: "/admin/products", label: "Produits", icon: "products", match: ["/admin/products", "/admin/collections", "/admin/inventory", "/admin/reviews", "/admin/gift-cards"], children: [{ href: "/admin/collections", label: "Collections" }, { href: "/admin/inventory", label: "Stock" }, { href: "/admin/gift-cards", label: "Cartes cadeaux" }, { href: "/admin/reviews", label: "Avis" }] },
    { href: "/admin/customers", label: "Clients", icon: "customers" },
    { href: "/admin/analytics", label: "Statistiques", icon: "chart" },
    { href: "/admin/discounts", label: "Remises", icon: "discounts" },
  ];
  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-3">
      {storeCount > 1 && (
        <ul className="-mb-2 flex flex-col gap-0.5 border-b border-[#d4d4d4] pb-2">
          <NavLink item={{ href: "/admin/overview", label: `Toutes les boutiques (${storeCount})`, icon: "stores" }} path={path} />
        </ul>
      )}
      <ul className="flex flex-col gap-0.5">{main.map((i) => <NavLink key={i.href} item={i} path={path} />)}</ul>
      <div>
        <div className="mb-1 flex items-center justify-between px-2 text-xs font-[550] text-muted">Canaux de vente</div>
        <ul className="flex flex-col gap-0.5">
          <NavLink item={{ href: "/admin/theme", label: "Boutique en ligne", icon: "store", match: ["/admin/theme", "/admin/pages", "/admin/blog"], children: [{ href: "/admin/theme", label: "Thèmes" }, { href: "/admin/pages", label: "Pages" }, { href: "/admin/blog", label: "Articles de blog" }] }} path={path} />
        </ul>
        <a href={`/s/${storeSlug}`} target="_blank" className="mt-0.5 flex h-7 items-center gap-2 rounded-lg pl-9 pr-2 text-[13px] text-muted hover:bg-[#f1f1f1] hover:text-ink">
          Voir la boutique <Icon name="eye" className="h-4 w-4" />
        </a>
      </div>
      {isOwner && (
        <ul className="mt-auto flex flex-col gap-0.5">
          <NavLink item={{ href: "/admin/settings", label: "Paramètres", icon: "settings" }} path={path} />
        </ul>
      )}
    </nav>
  );
}
