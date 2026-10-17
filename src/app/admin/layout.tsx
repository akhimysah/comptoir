import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logout } from "../(auth)/actions";
import { AdminNav, Icon } from "@/components/admin/Nav";
import { isPlatformAdmin } from "@/lib/errors";
import { MobileNavToggle } from "@/components/admin/MobileNav";
import { requireStore } from "@/lib/auth";
import { billingEnabled, planState } from "@/lib/billing";
import { db } from "@/lib/db";
import { initials } from "@/lib/utils";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, store, stores, isOwner, perms } = await requireStore();
  const billing = billingEnabled() ? planState(store) : null;
  const unread = await db.conversation.aggregate({ where: { storeId: store.id, status: "open" }, _sum: { unread: true } });
  const returnsToHandle = await db.returnRequest.count({ where: { storeId: store.id, status: { in: ["requested", "received"] } } });
  const toShip = await db.order.count({ where: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, fulfillmentStatus: "unfulfilled", cancelledAt: null } });
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-[linear-gradient(90deg,#140b33_0%,#1a1a1a_45%)] px-3 text-white md:px-4">
        <MobileNavToggle />
        <Link href="/admin" className="flex items-center gap-2 pr-2">
          <Logo size={28} withName={false} />
          <span className="hidden text-[15px] font-semibold sm:inline">Parnassa <span className="text-[#a78bfa]">Pay</span></span>
        </Link>
        <form action="/admin/search" className="mx-auto w-full max-w-[600px]">
          <label className="flex h-9 items-center gap-2 rounded-[10px] border border-[#4a4a4a] bg-[#303030] px-3 text-[#b5b5b5] focus-within:border-[#8a8a8a] focus-within:bg-[#3a3a3a]">
            <Icon name="search" className="h-4 w-4" />
            <input id="admin-search" name="q" placeholder="Rechercher" className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-[#b5b5b5]" />
            <kbd className="hidden whitespace-nowrap rounded border border-[#4a4a4a] px-1.5 font-sans text-[11px] sm:inline">⌘K</kbd>
          </label>
        </form>
        <button className="hidden h-8 w-8 place-items-center rounded-lg text-[#e3e3e3] hover:bg-[#303030] sm:grid" aria-label="Notifications"><Icon name="bell" /></button>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-[#303030]">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#c4b5fd] text-xs font-semibold text-[#2e1065]">{initials(store.name)}</span>
            <span className="hidden max-w-[160px] truncate text-[13px] font-[550] md:inline">{store.name}</span>
            <svg viewBox="0 0 20 20" className="hidden h-4 w-4 text-[#b5b5b5] md:block" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="m6 8 4 4 4-4" /></svg>
          </summary>
          <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white p-1.5 text-ink shadow-[0_4px_16px_rgba(0,0,0,.18),0_0_0_1px_rgba(0,0,0,.06)]">
            <div className="px-2.5 pb-1 pt-1.5 text-xs font-[550] text-muted">Boutiques</div>
            {stores.map((s) => (
              <a key={s.id} href={`/admin/switch?store=${s.id}`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-[#f1f1f1]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#c4b5fd] text-[10px] font-semibold text-[#2e1065]">{initials(s.name)}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.id === store.id && <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="m5 10.5 3 3 7-7" /></svg>}
              </a>
            ))}
            <Link href="/admin/overview" className="mt-1 block rounded-lg px-2.5 py-1.5 font-[550] hover:bg-[#f1f1f1]">Vue d'ensemble de toutes les boutiques</Link>
            <Link href="/admin/stores/new" className="block rounded-lg px-2.5 py-1.5 text-pine hover:bg-[#f1f1f1]">+ Créer une boutique</Link>
            <div className="my-1 border-t border-line" />
            <div className="px-2.5 py-1.5">
              <div className="font-[550]">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}{!isOwner && " · collaborateur"}</div>
            </div>
            <Link href="/admin/account" className="block rounded-lg px-2.5 py-1.5 hover:bg-[#f1f1f1]">Sécurité du compte</Link>
            {isPlatformAdmin(user.email) && <Link href="/admin/platform/errors" className="block rounded-lg px-2.5 py-1.5 hover:bg-[#f1f1f1]">Erreurs de la plateforme</Link>}
            {isPlatformAdmin(user.email) && <Link href="/admin/platform/github" className="block rounded-lg px-2.5 py-1.5 hover:bg-[#f1f1f1]">Application GitHub</Link>}
            {isOwner && <Link href="/admin/settings" className="block rounded-lg px-2.5 py-1.5 hover:bg-[#f1f1f1]">Paramètres</Link>}
            <a href={`/s/${store.slug}`} target="_blank" className="block rounded-lg px-2.5 py-1.5 hover:bg-[#f1f1f1]">Voir la boutique</a>
            <form action={logout}><button className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-[#f1f1f1]">Se déconnecter</button></form>
          </div>
        </details>
      </header>
      <div className="flex">
        <aside id="admin-nav" className="fixed bottom-0 left-0 top-14 z-30 hidden w-64 bg-side shadow-[8px_0_24px_rgba(0,0,0,.2)] md:shadow-none data-[open=true]:block md:sticky md:top-14 md:block md:h-[calc(100vh-56px)] md:shrink-0">
          <AdminNav toShip={toShip} returnsToHandle={returnsToHandle} unreadMessages={perms.includes("customers") ? unread._sum.unread ?? 0 : 0} storeSlug={store.slug} isOwner={isOwner} storeCount={stores.length} perms={perms} />
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 md:px-8">
          <div className="mx-auto flex max-w-[1000px] flex-col gap-4">
            {billing && (!billing.canSell || (billing.trial && billing.daysLeft <= 3)) && (
              <div role="status" className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px] ${billing.canSell ? "bg-[#fff1e3] text-[#5e4200]" : "bg-[#fedad9] text-[#8e0b21]"}`}>
                <span className="flex-1">{!billing.canSell ? "Les ventes de votre boutique sont suspendues : choisissez un forfait (ou réglez le paiement en retard) pour les rouvrir." : `Votre essai gratuit se termine dans ${billing.daysLeft} jour${billing.daysLeft > 1 ? "s" : ""}.`}</span>
                {isOwner && <a href="/admin/settings/plan" className="btn h-8">Choisir un forfait</a>}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
