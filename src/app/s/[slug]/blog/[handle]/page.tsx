import type { Metadata } from "next";
import { RichText } from "@/components/store/RichText";
import { db } from "@/lib/db";
import { notFoundOrRedirect } from "@/lib/navigation";
import { getStore } from "@/lib/storefront";
import { intlLocale } from "@/lib/i18n";
import { commentsMode, publishedComments } from "@/lib/comments";

async function load(slug: string, handle: string) {
  const { store } = await getStore(slug);
  const post = await db.blogPost.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!post || !post.published) return notFoundOrRedirect(store, `/blog/${handle}`);
  return post;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }): Promise<Metadata> {
  const { slug, handle } = await params;
  const post = await load(slug, handle);
  const description = post.seoDescription || post.excerpt || post.body.replace(/[#*\[\]()]/g, "").slice(0, 160);
  return { title: post.seoTitle || post.title, description, openGraph: { title: post.seoTitle || post.title, description, type: "article", ...(post.image ? { images: [post.image] } : {}) } };
}

export default async function BlogPostPage({ params, searchParams }: { params: Promise<{ slug: string; handle: string }>; searchParams: Promise<{ comment?: string }> }) {
  const [{ slug, handle }, { comment }] = await Promise.all([params, searchParams]);
  const [post, { store, locale }] = await Promise.all([load(slug, handle), getStore(slug)]);
  const mode = commentsMode(store);
  const comments = mode === "off" ? [] : await publishedComments(post.id);
  const en = locale === "en";
  const notice = comment === "ok" ? (en ? "Thank you, your comment is published." : "Merci, votre commentaire est publié.") : comment === "pending" ? (en ? "Thank you, your comment will appear once approved." : "Merci, votre commentaire apparaîtra après validation.") : comment === "err" ? (en ? "Please fill in your name, a valid email and your comment." : "Indiquez votre nom, un e-mail valide et votre commentaire.") : null;
  return (
    <article className="mx-auto max-w-2xl px-4 py-14">
      <a href={`/s/${slug}/blog`} className="text-sm text-[var(--c-muted)] hover:underline">← Blog</a>
      <h1 className="mb-2 mt-4 font-[family-name:var(--t-display)] text-3xl font-semibold leading-tight md:text-5xl">{post.title}</h1>
      <p className="mb-8 text-sm text-[var(--c-muted)]">{post.publishedAt?.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" })}{post.author ? ` · ${post.author}` : ""}</p>
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image} alt="" className="mb-8 w-full rounded-[var(--t-radius)] object-cover" />
      )}
      <RichText text={post.body} />
      {mode !== "off" && (
        <section className="mt-14 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-10" id="comments">
          <h2 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold">{en ? "Comments" : "Commentaires"}{comments.length ? ` (${comments.length})` : ""}</h2>
          {comments.length > 0 && (
            <ul className="mb-10 flex flex-col gap-6">
              {comments.map((c) => <li key={c.id} id={`comment-${c.id}`}><div className="text-sm font-semibold">{c.author} <span className="font-normal text-[var(--c-muted)]">· {c.createdAt.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" })}</span></div><p className="mt-1 whitespace-pre-line">{c.body}</p></li>)}
            </ul>
          )}
          {notice && <p role="status" className="mb-4 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">{notice}</p>}
          <form method="post" action={`/s/${slug}/blog/${handle}/comment`} className="flex flex-col gap-3">
            <h3 className="font-semibold">{en ? "Leave a comment" : "Laisser un commentaire"}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="author" required maxLength={80} placeholder={en ? "Name" : "Nom"} aria-label={en ? "Name" : "Nom"} className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-transparent px-3 py-2" />
              <input name="email" type="email" required placeholder="E-mail" aria-label="E-mail" className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-transparent px-3 py-2" />
            </div>
            <textarea name="body" required minLength={2} maxLength={3000} rows={4} placeholder={en ? "Your comment" : "Votre commentaire"} aria-label={en ? "Comment" : "Commentaire"} className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-transparent px-3 py-2" />
            <p className="text-xs text-[var(--c-muted)]">{mode === "moderated" ? (en ? "Comments are reviewed before being published." : "Les commentaires sont relus avant publication.") : (en ? "Your email is never shown." : "Votre e-mail n'est jamais affiché.")}</p>
            <button className="self-start rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)]">{en ? "Post comment" : "Publier le commentaire"}</button>
          </form>
        </section>
      )}
    </article>
  );
}
