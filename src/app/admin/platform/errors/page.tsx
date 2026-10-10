import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";

async function guard() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
}

async function resolve(form: FormData) {
  "use server";
  await guard();
  await db.errorLog.update({ where: { id: String(form.get("id")) }, data: { resolved: true } });
  revalidatePath("/admin/platform/errors");
}

async function purge() {
  "use server";
  await guard();
  await db.errorLog.deleteMany({ where: { resolved: true } });
  revalidatePath("/admin/platform/errors");
}

/** Erreurs du serveur, réservées aux administrateurs de la plateforme (PLATFORM_ADMINS). */
export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await guard();
  const { all } = await searchParams;
  const errors = await db.errorLog.findMany({ where: all ? {} : { resolved: false }, orderBy: { lastAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Erreurs de la plateforme" subtitle="Erreurs serveur de toutes les boutiques, regroupées. Un e-mail part au plus une fois par heure pour une même erreur." actions={<form action={purge}><button className="btn">Supprimer les erreurs résolues</button></form>} />
      <div className="mb-3 flex gap-2 text-[13px]"><a href="/admin/platform/errors" className={`btn btn-sm ${!all ? "bg-[#e3e3e3]" : ""}`}>À traiter</a><a href="/admin/platform/errors?all=1" className={`btn btn-sm ${all ? "bg-[#e3e3e3]" : ""}`}>Toutes</a></div>
      <section className="card overflow-hidden">
        {errors.length ? (
          <ul>
            {errors.map((e) => (
              <li key={e.id} className="border-b border-line last:border-0">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 hover:bg-[#f7f7f7]">
                    {e.resolved ? <Pill tone="ok">Résolue</Pill> : <Pill tone="bad">{e.count} fois</Pill>}
                    <span className="min-w-0 flex-1 truncate font-[550]">{e.message}</span>
                    <span className="font-mono text-xs text-muted">{e.method} {e.path}</span>
                    <span className="text-xs text-muted">{formatDateTime(e.lastAt)}</span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3">
                    <p className="text-xs text-muted">Type : {e.kind || "?"} · première fois le {formatDateTime(e.firstAt)}</p>
                    {e.stack && <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-[11px] leading-relaxed">{e.stack}</pre>}
                    {!e.resolved && <form action={resolve}><input type="hidden" name="id" value={e.id} /><button className="btn btn-sm">Marquer comme résolue</button></form>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-muted">Aucune erreur {all ? "" : "à traiter"}. 🎉</p>
        )}
      </section>
    </>
  );
}
