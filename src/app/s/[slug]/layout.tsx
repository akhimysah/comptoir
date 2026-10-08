import type { Metadata } from "next";
import { CartLink } from "@/components/store/Header";
import { storeFontVars } from "@/components/store/fonts";
import { getCatalog, getStore } from "@/lib/storefront";
import { themeVars } from "@/lib/theme";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { store } = await getStore((await params).slug);
  return { title: { absolute: store.name, template: `%s · ${store.name}` }, description: store.tagline || undefined };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, theme } = await getStore(slug);
  const { collections } = await getCatalog(store.id);
  return (
    <div style={themeVars(theme) as React.CSSProperties} className={`${storeFontVars} flex min-h-screen flex-col bg-[var(--c-bg)] font-[family-name:var(--t-body)] text-[var(--c-text)]`}>
      {theme.announcement && <div className="bg-[var(--c-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--c-accent-text)]">{theme.announcement}</div>}
      <header className="sticky top-0 z-20 border-b border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] bg-[var(--c-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
          <a href={`/s/${slug}`} className="mr-auto font-[family-name:var(--t-display)] text-xl font-semibold md:text-2xl">{store.name}</a>
          <nav className="hidden items-center gap-5 text-sm md:flex">
            <a href={`/s/${slug}/products`} className="hover:opacity-70">Tous les produits</a>
            {collections.slice(0, 4).map((c) => <a key={c.handle} href={`/s/${slug}/c/${c.handle}`} className="hover:opacity-70">{c.title}</a>)}
          </nav>
          <CartLink slug={slug} />
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-3 text-sm md:hidden">
          <a href={`/s/${slug}/products`} className="whitespace-nowrap">Tous les produits</a>
          {collections.map((c) => <a key={c.handle} href={`/s/${slug}/c/${c.handle}`} className="whitespace-nowrap">{c.title}</a>)}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-[var(--c-muted)]">
          <span>© {new Date().getFullYear()} {store.name}{store.tagline ? ` · ${store.tagline}` : ""}</span>
          <a href="/" className="hover:opacity-70">Boutique propulsée par Comptoir</a>
        </div>
      </footer>
    </div>
  );
}
