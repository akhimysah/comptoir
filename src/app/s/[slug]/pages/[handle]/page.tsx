import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RichText } from "@/components/store/RichText";
import { db } from "@/lib/db";
import { getStore } from "@/lib/storefront";

async function load(slug: string, handle: string) {
  const { store } = await getStore(slug);
  const page = await db.page.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!page || !page.published) notFound();
  return page;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }): Promise<Metadata> {
  const { slug, handle } = await params;
  const page = await load(slug, handle);
  return { title: page.seoTitle || page.title, description: page.seoDescription || page.body.replace(/[#*\[\]()]/g, "").slice(0, 160) };
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const page = await load(slug, handle);
  return (
    <article className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="mb-8 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{page.title}</h1>
      <RichText text={page.body} className="text-[var(--c-text)]" />
    </article>
  );
}
