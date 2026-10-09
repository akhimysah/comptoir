import type { Metadata } from "next";
import { RichText } from "@/components/store/RichText";
import { db } from "@/lib/db";
import { notFoundOrRedirect } from "@/lib/navigation";
import { getStore } from "@/lib/storefront";

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

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const post = await load(slug, handle);
  return (
    <article className="mx-auto max-w-2xl px-4 py-14">
      <a href={`/s/${slug}/blog`} className="text-sm text-[var(--c-muted)] hover:underline">← Blog</a>
      <h1 className="mb-2 mt-4 font-[family-name:var(--t-display)] text-3xl font-semibold leading-tight md:text-5xl">{post.title}</h1>
      <p className="mb-8 text-sm text-[var(--c-muted)]">{post.publishedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}{post.author ? ` · ${post.author}` : ""}</p>
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image} alt="" className="mb-8 w-full rounded-[var(--t-radius)] object-cover" />
      )}
      <RichText text={post.body} />
    </article>
  );
}
