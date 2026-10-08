"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const ICONS: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  orders: "M6 3h12l1 4H5zM5 7h14v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9 11h6",
  products: "M20 7l-8-4-8 4 8 4zM4 7v10l8 4 8-4V7M12 11v10",
  collections: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z",
  customers: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 6",
  discounts: "M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01M3 12l2-2V6a1 1 0 0 1 1-1h4l2-2 2 2h4a1 1 0 0 1 1 1v4l2 2-2 2v4a1 1 0 0 1-1 1h-4l-2 2-2-2H6a1 1 0 0 1-1-1v-4z",
  theme: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  store: "M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11zM5 13.5V20h14v-6.5",
};
export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cx("shrink-0", className)} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

const ITEMS = [
  { href: "/admin", label: "Accueil", icon: "home" },
  { href: "/admin/orders", label: "Commandes", icon: "orders" },
  { href: "/admin/products", label: "Produits", icon: "products" },
  { href: "/admin/collections", label: "Collections", icon: "collections" },
  { href: "/admin/customers", label: "Clients", icon: "customers" },
  { href: "/admin/discounts", label: "Codes promo", icon: "discounts" },
  { href: "/admin/theme", label: "Thème", icon: "theme" },
  { href: "/admin/settings", label: "Réglages", icon: "settings" },
];

export function AdminNav({ toShip }: { toShip: number }) {
  const path = usePathname();
  return (
    <nav className="flex gap-0.5 md:flex-col">
      {ITEMS.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition",
              active ? "bg-[#22392F] font-semibold text-white" : "text-[#B9CCC2] hover:bg-[#22392F] hover:text-white",
            )}
          >
            <Icon name={it.icon} />
            <span className="hidden md:inline">{it.label}</span>
            {it.icon === "orders" && toShip > 0 && <span className="ml-auto hidden rounded-full bg-pine px-1.5 font-mono text-[0.7rem] text-white md:inline">{toShip}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
