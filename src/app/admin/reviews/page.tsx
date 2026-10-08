import Link from "next/link";
import { deleteReview, setReviewStatus } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { cx, formatDateTime } from "@/lib/utils";

const TABS = [["pending", "En attente"], ["published", "Publiés"], ["hidden", "Masqués"]] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "pending" } = await searchParams;
  const { store } = await requireStore();
  const [reviews, counts] = await Promise.all([
    db.review.findMany({ where: { storeId: store.id, status: tab }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.review.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader title="Avis produits" subtitle="Les avis laissés par vos clients n'apparaissent dans la boutique qu'une fois publiés." />
      <section className="card overflow-hidden">
        <div className="flex gap-1 border-b border-line px-2 py-1.5">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/admin/reviews?tab=${k}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", tab === k ? "bg-[#e3e3e3]" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>
              {label}{count(k) > 0 && <span className="ml-1 text-xs tabular-nums text-muted">{count(k)}</span>}
            </Link>
          ))}
        </div>
        {reviews.length ? (
          <ul>
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#e3a008]" aria-label={`${r.rating} sur 5`}>{"★".repeat(r.rating)}<span className="text-[#d4d4d4]">{"★".repeat(5 - r.rating)}</span></span>
                    <span className="font-[550]">{r.name}</span>
                    <span className="text-xs text-muted">{r.email}</span>
                    {r.verified && <Pill tone="ok" dot={false}>Achat vérifié</Pill>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">sur <Link href={`/admin/products/${r.productId}`} className="text-pine hover:underline">{r.product.title}</Link> · {formatDateTime(r.createdAt)}</div>
                  {r.title && <p className="mt-1.5 font-[550]">{r.title}</p>}
                  <p className="mt-0.5 whitespace-pre-line">{r.body}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {r.status !== "published" && <form action={setReviewStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="published" /><button className="btn btn-primary btn-sm">Publier</button></form>}
                  {r.status !== "hidden" && <form action={setReviewStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="hidden" /><button className="btn btn-sm">Masquer</button></form>}
                  <form action={deleteReview}><input type="hidden" name="id" value={r.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" className="btn-sm" /></form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{tab === "pending" ? "Aucun avis à modérer." : tab === "published" ? "Aucun avis publié pour l'instant." : "Aucun avis masqué."}</Empty>
        )}
      </section>
    </>
  );
}
