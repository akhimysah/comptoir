import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function ListPage() {
  const { store } = await requireStore();
  const items = await db.blogPost.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" } });
  return (
    <>
      <PageHeader title="Articles de blog" actions={<Link href="/admin/blog/new" className="btn btn-primary">Créer un article</Link>} />
      <section className="card overflow-hidden">
        {items.length ? (
          <table className="w-full">
            <thead><tr><th className="th">Titre</th><th className="th">Visibilité</th><th className="th hidden sm:table-cell">Modifié</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-[#f7f7f7]">
                  <td className="td"><Link href={`/admin/blog/${i.id}`} className="font-[550] hover:underline">{i.title}</Link><div className="text-xs text-muted">/blog/{i.handle}</div></td>
                  <td className="td">{i.published ? <Pill tone="ok">Visible</Pill> : <Pill>Masqué</Pill>}</td>
                  <td className="td hidden text-muted sm:table-cell">{formatDate(i.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Rien pour l'instant" action={<Link href="/admin/blog/new" className="btn btn-primary">Créer un article</Link>}>Publiez des articles pour raconter votre histoire, donner des conseils et attirer des visiteurs depuis Google.</Empty>
        )}
      </section>
    </>
  );
}
