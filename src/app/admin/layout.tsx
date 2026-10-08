import Link from "next/link";
import { logout } from "../(auth)/actions";
import { AdminNav, Icon } from "@/components/admin/Nav";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, store } = await requireStore();
  const toShip = await db.order.count({ where: { storeId: store.id, paymentStatus: "paid", fulfillmentStatus: "unfulfilled", cancelledAt: null } });
  return (
    <div className="md:grid md:min-h-screen md:grid-cols-[236px_1fr]">
      <aside className="sticky top-0 z-30 flex items-center gap-2 overflow-x-auto bg-side px-3 py-2 text-[#B9CCC2] md:h-screen md:flex-col md:items-stretch md:gap-1 md:overflow-visible md:px-3 md:py-5">
        <div className="flex items-center gap-2.5 px-1.5 md:mb-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-pine font-display font-bold text-white">{store.name[0]?.toUpperCase()}</span>
          <div className="hidden min-w-0 md:block">
            <div className="truncate font-display font-bold leading-tight text-white">{store.name}</div>
            <div className="truncate text-xs opacity-70">{user.name}</div>
          </div>
        </div>
        <AdminNav toShip={toShip} />
        <div className="flex gap-1 md:mt-auto md:flex-col">
          <Link href={`/s/${store.slug}`} target="_blank" className="flex items-center gap-2.5 whitespace-nowrap rounded-lg border border-[#22392F] px-2.5 py-2 text-sm hover:bg-[#22392F] hover:text-white">
            <Icon name="store" /><span className="hidden md:inline">Voir la boutique</span>
          </Link>
          <form action={logout}>
            <button className="w-full whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm opacity-80 hover:bg-[#22392F] hover:text-white">Déconnexion</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 pb-16 pt-6 md:px-10 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
