import Link from "next/link";
import { moderateComment, setCommentsMode } from "./actions";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { COMMENT_MODES, commentsMode } from "@/lib/comments";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Commentaires" };

/** Commentaires des articles de blog : réglage et modération, comme sur Shopify. */
export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "pending" } = await searchParams;
  const { store } = await requirePerm("content");
  const status = tab === "published" ? "published" : tab === "spam" ? "spam" : "pending";
  const [comments, counts] = await Promise.all([
    db.blogComment.findMany({ where: { storeId: store.id, status }, include: { post: { select: { title: true, handle: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.blogComment.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const mode = commentsMode(store);
  return (
    <>
      <PageHeader back="/admin/blog" title="Commentaires" subtitle="Les commentaires laissés sous vos articles. Choisissez s'ils sont désactivés, relus avant publication ou publiés immédiatement." />
      <form action={setCommentsMode} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="label flex-1">Commentaires sur les articles<select name="mode" defaultValue={mode} className="input">{(Object.keys(COMMENT_MODES) as (keyof typeof COMMENT_MODES)[]).map((k) => <option key={k} value={k}>{COMMENT_MODES[k]}</option>)}</select></label>
        <button className="btn btn-primary">Enregistrer</button>
      </form>
      <div className="flex gap-1 border-b border-line">
        {([["pending", "En attente"], ["published", "Publiés"], ["spam", "Indésirables"]] as const).map(([k, label]) => (
          <Link key={k} href={`/admin/blog/comments?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-[550] ${status === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label} <span className="ml-1 rounded-full bg-[#f1f1f1] px-1.5 text-xs">{count(k)}</span></Link>
        ))}
      </div>
      <section className="card overflow-hidden">
        {comments.length ? (
          <ul>
            {comments.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-4 border-b border-line px-4 py-4 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-[650]">{c.author}</span><span className="text-muted">{c.email}</span><span className="text-muted">· {formatDateTime(c.createdAt)}</span>{c.status === "pending" && <Pill tone="warn">En attente</Pill>}</div>
                  <p className="mt-1 whitespace-pre-line text-[13px]">{c.body}</p>
                  <div className="mt-1 text-xs text-muted">Sur « <a href={`/s/${store.slug}/blog/${c.post.handle}#comment-${c.id}`} target="_blank" className="underline">{c.post.title}</a> »</div>
                </div>
                <form action={moderateComment} className="flex flex-wrap gap-1">
                  <input type="hidden" name="id" value={c.id} />
                  {c.status !== "published" && <button name="action" value="publish" className="btn h-8 text-[13px]">Publier</button>}
                  {c.status === "published" && <button name="action" value="pending" className="btn h-8 text-[13px]">Dépublier</button>}
                  {c.status !== "spam" && <button name="action" value="spam" className="btn h-8 text-[13px]">Indésirable</button>}
                  <button name="action" value="delete" className="btn h-8 text-[13px] text-[#8e0b21]">Supprimer</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-[13px] text-muted">{status === "pending" ? "Aucun commentaire en attente." : status === "published" ? "Aucun commentaire publié." : "Aucun commentaire indésirable."}</p>
        )}
      </section>
    </>
  );
}
