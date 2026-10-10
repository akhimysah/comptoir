import { displayCurrency, storeCurrencies } from "@/lib/currency";
import type { Metadata } from "next";
import { CartLink } from "@/components/store/Header";
import { NewsletterForm } from "@/components/store/NewsletterForm";
import { ChatWidget } from "@/components/store/ChatWidget";
import { PredictiveSearch } from "@/components/store/PredictiveSearch";
import { PasswordGate } from "@/components/store/PasswordGate";
import { ConsentLink, Tracking } from "@/components/store/Tracking";
import { storeAccess } from "@/lib/store-access";
import { CurrencySelect } from "@/components/store/CurrencySelect";
import { storeFontVars } from "@/components/store/fonts";
import { getStoreUngated } from "@/lib/storefront";
import { resolveMenus, type ResolvedLink } from "@/lib/navigation";

const ext = (l: ResolvedLink) => (l.external ? { target: "_blank", rel: "noopener noreferrer" } : {});
import { themeVars } from "@/lib/theme";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { store } = await getStoreUngated((await params).slug);
  return { title: { absolute: store.name, template: `%s · ${store.name}` }, description: store.tagline || undefined, ...(store.passwordEnabled ? { robots: { index: false, follow: false } } : {}) };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, theme } = await getStoreUngated(slug);
  const currencies = storeCurrencies(store);
  const current = await displayCurrency(store);
  const access = await storeAccess(store);
  if (!access.allowed) {
    return (
      <div style={themeVars(theme) as React.CSSProperties} className={`${storeFontVars} min-h-screen bg-[var(--c-bg)] font-[family-name:var(--t-body)] text-[var(--c-text)]`}>
        <PasswordGate slug={slug} name={store.name} message={store.passwordMessage} />
      </div>
    );
  }
  const menus = await resolveMenus(store);
  return (
    <div style={themeVars(theme) as React.CSSProperties} className={`${storeFontVars} flex min-h-screen flex-col bg-[var(--c-bg)] font-[family-name:var(--t-body)] text-[var(--c-text)]`}>
      {access.preview && (
        <div className="bg-[#1a1a1a] px-4 py-2 text-center text-xs text-white">
          Boutique protégée par mot de passe : vous la voyez car vous êtes connecté à l'admin. <a href="/admin/settings/preferences" className="underline underline-offset-2">Préférences</a>
        </div>
      )}
      {theme.announcement && <div className="bg-[var(--c-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--c-accent-text)]">{theme.announcement}</div>}
      <header className="sticky top-0 z-20 border-b border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] bg-[var(--c-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
          <a href={`/s/${slug}`} className="mr-auto font-[family-name:var(--t-display)] text-xl font-semibold md:text-2xl">{store.name}</a>
          <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="Menu principal">
            {menus.main.map((l, i) =>
              l.children.length ? (
                <div key={i} className="group relative">
                  <a href={l.href} {...ext(l)} className="inline-flex items-center gap-1 hover:opacity-70" aria-haspopup="true">
                    {l.title}
                    <svg viewBox="0 0 12 12" className="h-3 w-3 transition group-hover:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="m3 4.5 3 3 3-3" /></svg>
                  </a>
                  <div className="invisible absolute left-1/2 top-full z-30 -translate-x-1/2 pt-3 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <ul className="min-w-52 rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] bg-[var(--c-bg)] p-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,.25)]">
                      {l.children.map((c, j) => <li key={j}><a href={c.href} {...ext(c)} className="block rounded-[calc(var(--t-radius)/2)] px-3 py-2 hover:bg-[color-mix(in_srgb,var(--c-text)_6%,transparent)]">{c.title}</a></li>)}
                    </ul>
                  </div>
                </div>
              ) : (
                <a key={i} href={l.href} {...ext(l)} className="hover:opacity-70">{l.title}</a>
              ),
            )}
          </nav>
          {currencies.length > 1 && <CurrencySelect slug={slug} codes={currencies.map((c) => c.code)} current={current.code} />}
          <PredictiveSearch slug={slug} currency={current.code} rate={current.rate} />
          <a href={`/s/${slug}/favorites`} aria-label="Mes favoris" className="rounded-[var(--t-radius)] p-1.5 hover:opacity-70">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
          </a>
          <a href={`/s/${slug}/account`} aria-label="Mon compte" className="rounded-[var(--t-radius)] p-1.5 hover:opacity-70">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
          </a>
          <CartLink slug={slug} />
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-3 text-sm md:hidden">
          {menus.main.flatMap((l) => [l, ...l.children]).map((l, i) => <a key={i} href={l.href} {...ext(l)} className="whitespace-nowrap">{l.title}</a>)}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      {(store.gaId || store.metaPixelId) && <Tracking slug={slug} gaId={store.gaId} pixelId={store.metaPixelId} />}
      {store.chatEnabled && <ChatWidget slug={slug} storeName={store.name} greeting={store.chatGreeting} />}
      <footer className="border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
        <div className="mx-auto max-w-6xl px-4 pt-10 text-[var(--c-muted)]"><NewsletterForm slug={slug} /></div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-[var(--c-muted)]">
          <span>© {new Date().getFullYear()} {store.name}{store.tagline ? ` · ${store.tagline}` : ""}</span>
          {menus.footer.length > 0 && (
            <nav className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Pied de page">
              {menus.footer.flatMap((l) => [l, ...l.children]).map((l, i) => <a key={i} href={l.href} {...ext(l)} className="hover:opacity-70">{l.title}</a>)}
            </nav>
          )}
          <span className="flex gap-4">
            {(store.gaId || store.metaPixelId) && <ConsentLink />}
            <a href="/" className="hover:opacity-70">Boutique propulsée par Parnassa Pay</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
