import Link from "next/link";
import { replyAction, saveChatSettings, setConversationStatus } from "./actions";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { cx, formatDateTime, initials } from "@/lib/utils";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; err?: string; closed?: string; settings?: string }> }) {
  const { c: currentId, err, closed, settings } = await searchParams;
  const { store, isOwner } = await requirePerm("customers");
  const showClosed = closed === "1";
  const conversations = await db.conversation.findMany({
    where: { storeId: store.id, status: showClosed ? "closed" : "open" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ lastMessageAt: "desc" }],
    take: 100,
  });
  const current = currentId ? await db.conversation.findFirst({ where: { id: currentId, storeId: store.id }, include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } } }) : null;
  // Ouvrir une conversation la marque comme lue.
  if (current?.unread) await db.conversation.update({ where: { id: current.id }, data: { unread: 0 } });
  const customer = current ? await db.customer.findUnique({ where: { storeId_email: { storeId: store.id, email: current.email } }, include: { _count: { select: { orders: true } } } }) : null;

  return (
    <>
      <PageHeader title="Messagerie" subtitle="Les messages envoyés depuis la bulle de discussion de votre boutique. Vos réponses partent aussi par e-mail." />
      <div className="grid min-h-[520px] gap-4 lg:grid-cols-[320px_1fr]">
        <section className="card flex min-w-0 flex-col overflow-hidden">
          <nav className="flex gap-1 border-b border-line p-2 text-[13px] font-[550]" aria-label="Conversations">
            <Link href="/admin/inbox" className={cx("rounded-lg px-3 py-1.5", !showClosed ? "bg-[#ebebeb]" : "text-muted hover:bg-[#f1f1f1]")}>Ouvertes</Link>
            <Link href="/admin/inbox?closed=1" className={cx("rounded-lg px-3 py-1.5", showClosed ? "bg-[#ebebeb]" : "text-muted hover:bg-[#f1f1f1]")}>Fermées</Link>
          </nav>
          {conversations.length ? (
            <ul className="flex-1 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/inbox?c=${c.id}${showClosed ? "&closed=1" : ""}`} className={cx("flex gap-3 border-b border-line px-3 py-3 hover:bg-[#f7f7f7]", c.id === current?.id && "bg-[#f3f0ff]")}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#c4b5fd] text-xs font-semibold text-[#2e1065]">{initials(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className={cx("truncate", c.unread ? "font-[700]" : "font-[550]")}>{c.name}</span>{c.unread > 0 && <span className="rounded-full bg-[#7c3aed] px-1.5 text-[11px] font-[650] text-white">{c.unread}</span>}</span>
                      <span className="block truncate text-xs text-muted">{c.messages[0] ? `${c.messages[0].fromCustomer ? "" : "Vous : "}${c.messages[0].body}` : ""}</span>
                      <span className="text-[11px] text-muted">{formatDateTime(c.lastMessageAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 px-4 py-10 text-center text-muted">{showClosed ? "Aucune conversation fermée." : "Aucun message pour le moment. Ils apparaîtront ici dès qu'un visiteur écrira via la bulle de votre boutique."}</p>
          )}
        </section>

        <section className="card flex min-w-0 flex-col overflow-hidden">
          {current ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <div className="font-[650]">{current.name} {current.status === "closed" && <Pill>Fermée</Pill>}</div>
                  <div className="text-xs text-muted">{current.email}{customer ? <> · <Link href={`/admin/customers/${customer.id}`} className="text-pine hover:underline">client, {customer._count.orders} commande{customer._count.orders > 1 ? "s" : ""}</Link></> : " · pas encore client"}</div>
                </div>
                <form action={setConversationStatus}>
                  <input type="hidden" name="id" value={current.id} />
                  <input type="hidden" name="status" value={current.status === "open" ? "closed" : "open"} />
                  <button className="btn">{current.status === "open" ? "Marquer comme traitée" : "Rouvrir"}</button>
                </form>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#fafafa] p-4">
                {current.messages.map((m) => (
                  <div key={m.id} className={cx("flex max-w-[80%] flex-col", m.fromCustomer ? "items-start" : "items-end self-end")}>
                    <div className={cx("whitespace-pre-line break-words rounded-2xl px-3 py-2 text-[13px]", m.fromCustomer ? "rounded-bl-sm bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]" : "rounded-br-sm bg-[#7c3aed] text-white")}>{m.body}</div>
                    <span className="mt-0.5 text-[11px] text-muted">{m.fromCustomer ? current.name : m.authorName} · {formatDateTime(m.createdAt)}</span>
                  </div>
                ))}
              </div>
              <form action={replyAction} className="flex flex-col gap-2 border-t border-line p-3">
                <input type="hidden" name="id" value={current.id} />
                <textarea name="body" required maxLength={2000} rows={3} placeholder={`Répondre à ${current.name}…`} aria-label="Votre réponse" className="input resize-y" />
                {err && <p role="alert" className="text-[13px] text-[#8e0b21]">{err}</p>}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">Envoyé dans la bulle et par e-mail à {current.email}.</span>
                  <button className="btn btn-primary">Envoyer</button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-muted">Choisissez une conversation.</div>
          )}
        </section>
      </div>

      {isOwner && (
        <form action={saveChatSettings} className="card mt-4 flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-[650]">Bulle de discussion</h2>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="enabled" defaultChecked={store.chatEnabled} className="h-4 w-4 accent-[#7c3aed]" />Afficher sur la boutique</label>
          </div>
          <label className="label">Message d'accueil<input name="greeting" defaultValue={store.chatGreeting} maxLength={300} className="input" /></label>
          <div className="flex items-center justify-end gap-3">
            {settings && <span role="status" className="text-[13px] text-[#0c5132]">Enregistré.</span>}
            <button className="btn">Enregistrer</button>
          </div>
        </form>
      )}
    </>
  );
}
