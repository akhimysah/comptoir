import { db } from "@/lib/db";
import { ReviewForm } from "./ReviewForm";
import { Stars } from "./Stars";

export async function Reviews({ slug, productId }: { slug: string; productId: string }) {
  const reviews = await db.review.findMany({ where: { productId, status: "published" }, orderBy: { createdAt: "desc" }, take: 50 });
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));
  return (
    <section id="avis" className="mx-auto max-w-6xl border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] px-4 py-12">
      <h2 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold md:text-3xl">Avis clients</h2>
      <div className="grid gap-10 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3">
          {reviews.length ? (
            <>
              <div className="flex items-baseline gap-3"><span className="text-4xl font-semibold tabular-nums">{avg.toFixed(1).replace(".", ",")}</span><Stars value={avg} size="text-xl" /></div>
              <p className="text-sm text-[var(--c-muted)]">{reviews.length} avis</p>
              <ul className="flex flex-col gap-1 text-sm">
                {dist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2">
                    <span className="w-6 tabular-nums">{d.n}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c-text)_10%,transparent)]"><span className="block h-full bg-[#e3a008]" style={{ width: `${(d.c / reviews.length) * 100}%` }} /></span>
                    <span className="w-6 text-right tabular-nums text-[var(--c-muted)]">{d.c}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[var(--c-muted)]">Aucun avis pour le moment. Soyez le premier à donner le vôtre.</p>
          )}
          <ReviewForm slug={slug} productId={productId} />
        </div>
        <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-5 first:pt-0">
              <div className="flex flex-wrap items-center gap-3"><Stars value={r.rating} /><span className="font-semibold">{r.name}</span>{r.verified && <span className="text-xs text-[var(--c-muted)]">✓ Achat vérifié</span>}<span className="ml-auto text-xs text-[var(--c-muted)]">{r.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></div>
              {r.title && <p className="font-semibold">{r.title}</p>}
              <p className="whitespace-pre-line leading-relaxed text-[var(--c-muted)]">{r.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
