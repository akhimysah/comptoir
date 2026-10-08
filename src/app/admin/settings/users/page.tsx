import { removeMember, revokeInvite } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { InviteForm } from "@/components/admin/InviteForm";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, initials } from "@/lib/utils";

export default async function UsersPage() {
  const { user, store } = await requireOwner();
  const [members, invites] = await Promise.all([
    db.storeMember.findMany({ where: { storeId: store.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.storeInvite.findMany({ where: { storeId: store.id, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  const Avatar = ({ name }: { name: string }) => <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#c4b5fd] text-xs font-semibold text-[#2e1065]">{initials(name)}</span>;

  return (
    <>
      <PageHeader back="/admin/settings" title="Utilisateurs et autorisations" subtitle="Les collaborateurs gèrent les produits, les commandes et les clients. Les paramètres et les paiements restent réservés au propriétaire." />
      <section className="card overflow-hidden">
        <div className="card-h"><h2 className="text-sm font-[650]">Équipe ({members.length + 1})</h2></div>
        <ul>
          <li className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar name={user.name} />
            <div className="flex-1"><div className="font-[550]">{user.name}</div><div className="text-xs text-muted">{user.email}</div></div>
            <Pill tone="info" dot={false}>Propriétaire</Pill>
          </li>
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Avatar name={m.user.name} />
              <div className="flex-1"><div className="font-[550]">{m.user.name}</div><div className="text-xs text-muted">{m.user.email} · depuis le {formatDate(m.createdAt)}</div></div>
              <Pill dot={false}>Collaborateur</Pill>
              <form action={removeMember}><input type="hidden" name="id" value={m.id} /><ConfirmSubmit label="Retirer" confirmLabel="Confirmer" className="btn-sm" /></form>
            </li>
          ))}
        </ul>
      </section>

      <InviteForm />

      {invites.length > 0 && (
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Invitations en attente</h2></div>
          <ul>
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <div className="flex-1"><div className="font-[550]">{i.email}</div><div className="text-xs text-muted">Invité par {i.invitedBy} · expire le {formatDate(i.expiresAt)}</div></div>
                <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><button className="btn btn-sm">Annuler l'invitation</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
