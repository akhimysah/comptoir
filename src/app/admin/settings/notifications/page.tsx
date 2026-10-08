import Link from "next/link";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

const STATUS = { sent: { label: "Envoyé", tone: "ok" }, logged: { label: "Enregistré, non envoyé", tone: "neutral" }, failed: { label: "Échec", tone: "bad" } } as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { store } = await requireOwner();
  const mails = await db.mailLog.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const open = mails.find((m) => m.id === id) ?? null;
  const live = Boolean(process.env.RESEND_API_KEY);

  return (
    <>
      <PageHeader back="/admin/settings" title="Notifications" subtitle="E-mails envoyés automatiquement à vos clients et à vous." />
      {!live && (
        <p className="card bg-[#fff8db] px-4 py-3 text-[13px]">
          Aucun service d'envoi n'est configuré : les e-mails sont enregistrés ici mais ne partent pas. Ajoutez <code>RESEND_API_KEY</code> dans le fichier <code>.env</code> pour les envoyer vraiment (voir le README).
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="card min-w-0 overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Historique</h2></div>
          {mails.length ? (
            <ul>
              {mails.map((m) => (
                <li key={m.id} className="border-b border-line last:border-0">
                  <Link href={`/admin/settings/notifications?id=${m.id}`} className={`flex flex-col gap-1 px-4 py-2.5 hover:bg-[#f7f7f7] ${open?.id === m.id ? "bg-[#f1f1f1]" : ""}`}>
                    <span className="flex items-center justify-between gap-2"><span className="truncate font-[550]">{m.subject}</span><Pill tone={STATUS[m.status as keyof typeof STATUS]?.tone ?? "neutral"}>{STATUS[m.status as keyof typeof STATUS]?.label ?? m.status}</Pill></span>
                    <span className="text-xs text-muted">À {m.to} · {formatDateTime(m.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-muted">Aucun e-mail pour l'instant. Ils apparaissent dès qu'une commande est payée ou expédiée.</p>
          )}
        </section>
        <section className="card min-w-0 overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Aperçu</h2></div>
          {open ? (
            <>
              {open.error && <p className="border-b border-line bg-[#fedad9] px-4 py-2 text-xs text-[#8e0b21]">{open.error}</p>}
              <iframe title="Aperçu de l'e-mail" srcDoc={open.html} sandbox="" className="h-[560px] w-full bg-[#f1f1f1]" />
            </>
          ) : (
            <p className="px-4 py-10 text-center text-muted">Choisissez un e-mail pour le voir tel que le destinataire le reçoit.</p>
          )}
        </section>
      </div>
    </>
  );
}
