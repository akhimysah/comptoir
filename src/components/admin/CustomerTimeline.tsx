import Link from "next/link";
import { addCustomerComment, deleteCustomerComment } from "@/app/admin/customers/actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { formatDate, formatDateTime } from "@/lib/utils";

export type TimelineEntry = {
  id: string;
  at: Date;
  /** comment | order | mail | created | note | tags | tax | marketing | points | b2b | locale… */
  type: string;
  text: string;
  href?: string;
  /** Commentaire d'un employé : auteur affiché en gras, et supprimable. */
  author?: string;
};

const DOT: Record<string, string> = { comment: "bg-[#7c3aed]", order: "bg-[#0c5132]", mail: "bg-[#00527c]", created: "bg-[#616161]" };

/** Chronologie d'un client, comme sur Shopify : commentaires de l'équipe, commandes, e-mails envoyés, modifications de la fiche. */
export function CustomerTimeline({ customerId, entries }: { customerId: string; entries: TimelineEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime());
  // Regroupées par jour, les plus récentes en premier.
  const days = new Map<string, TimelineEntry[]>();
  for (const e of sorted) { const k = formatDate(e.at); days.set(k, [...(days.get(k) ?? []), e]); }
  return (
    <section className="card flex flex-col gap-4 p-4">
      <h2 className="text-sm font-[650]">Chronologie</h2>
      <form action={addCustomerComment} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={customerId} />
        <textarea id="customer-comment" name="comment" required maxLength={2000} rows={2} className="input min-h-[60px]" placeholder="Laisser un commentaire…" aria-label="Commentaire" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted">Seuls vous et les autres employés peuvent voir les commentaires.</p>
          <button className="btn btn-sm">Publier</button>
        </div>
      </form>
      {sorted.length === 0 ? <p className="text-[13px] text-muted">Aucun événement pour le moment.</p> : (
        <ol className="flex flex-col gap-4">
          {[...days].map(([day, items]) => (
            <li key={day}>
              <div className="mb-2 text-xs font-[550] text-muted">{day}</div>
              <ul className="flex flex-col gap-2.5 border-l border-line pl-4">
                {items.map((e) => (
                  <li key={e.id} className="relative text-[13px]">
                    <span aria-hidden className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${DOT[e.type] ?? "bg-[#b5b5b5]"}`} />
                    {e.type === "comment" ? (
                      <div className="rounded-lg bg-[#f7f7f7] px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 whitespace-pre-wrap break-words"><span className="font-[650]">{e.author}</span>{e.author ? " : " : ""}{e.text}</div>
                          <form action={deleteCustomerComment}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="customerId" value={customerId} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" className="btn-sm text-xs" /></form>
                        </div>
                        <div className="mt-1 text-xs text-muted">{formatDateTime(e.at)}</div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0">{e.href ? <Link href={e.href} className="hover:underline">{e.text}</Link> : e.text}</span>
                        <span className="text-xs text-muted">{formatDateTime(e.at).split(" ").slice(-1)[0]}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
