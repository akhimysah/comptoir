import { Thumb } from "@/components/ui";
import { db } from "@/lib/db";
import { dict, intlLocale } from "@/lib/i18n";
import { getStore } from "@/lib/storefront";

const T = dict(
  { title: "Blog", empty: "Aucun article pour le moment." },
  { title: "Blog", empty: "No articles yet." },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function BlogIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, locale } = await getStore(slug);
  const posts = await db.blogPost.findMany({ where: { storeId: store.id, published: true }, orderBy: { publishedAt: "desc" } });
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{T[locale].title}</h1>
      {posts.length ? (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p, i) => (
            <a key={p.id} href={`/s/${slug}/blog/${p.handle}`} className="group flex flex-col gap-3">
              <div className="overflow-hidden rounded-[var(--t-radius)]"><Thumb image={p.image} hue={(i * 71 + 30) % 360} title={p.title} rounded="" className="aspect-[16/10] w-full text-3xl transition duration-500 group-hover:scale-[1.03]" /></div>
              <span className="text-xs text-[var(--c-muted)]">{p.publishedAt?.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" })}{p.author ? ` · ${p.author}` : ""}</span>
              <h2 className="font-[family-name:var(--t-display)] text-xl font-semibold leading-snug">{p.title}</h2>
              {p.excerpt && <p className="text-[var(--c-muted)]">{p.excerpt}</p>}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-[var(--c-muted)]">{T[locale].empty}</p>
      )}
    </div>
  );
}
