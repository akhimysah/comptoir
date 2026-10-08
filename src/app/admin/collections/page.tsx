import Link from "next/link";
import { Empty, PageHeader, Thumb } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CollectionsPage() {
  const { store } = await requireStore();
  const collections = await db.collection.findMany({ where: { storeId: store.id }, include: { _count: { select: { products: true } } }, orderBy: { title: "asc" } });
  return (
    <>
      <PageHeader title="Collections" subtitle="Regroupez vos produits pour aider vos clients à s'y retrouver." actions={<Link href="/admin/collections/new" className="btn btn-primary">Créer une collection</Link>} />
      <div className="card">
        {collections.length ? (
          <ul>
            {collections.map((c, i) => (
              <li key={c.id} className="border-b border-line last:border-0">
                <Link href={`/admin/collections/${c.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-[#f7f7f7]">
                  <Thumb image={c.image} hue={(i * 67 + 140) % 360} title={c.title} className="h-12 w-16 text-sm" />
                  <span className="flex-1">
                    <span className="block font-semibold">{c.title}</span>
                    <span className="text-xs text-muted">/c/{c.handle}</span>
                  </span>
                  <span className="text-sm text-muted">{c._count.products} produit{c._count.products > 1 ? "s" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Aucune collection" action={<Link href="/admin/collections/new" className="btn btn-primary">Créer une collection</Link>}>Par exemple « Nouveautés », « Soldes » ou « Pour la cuisine ».</Empty>
        )}
      </div>
    </>
  );
}
