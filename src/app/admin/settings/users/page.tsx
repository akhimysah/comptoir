import { removeMember, revokeInvite, setPermissions } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { InviteForm } from "@/components/admin/InviteForm";
import { PageHeader, Pill } from "@/components/ui";
import { AREA_LABELS, AREAS, requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, initials, parseJson } from "@/lib/utils";

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
          {members.map((m) => {
            const perms = parseJson<string[]>(m.permissions, []);
            return (
              <li key={m.id} className="border-b border-line px-4 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  <Avatar name={m.user.name} />
                  <div className="flex-1"><div className="font-[550]">{m.user.name}</div><div className="text-xs text-muted">{m.user.email} · depuis le {formatDate(m.createdAt)}</div></div>
                  <Pill dot={false}>Collaborateur</Pill>
                  <form action={removeMember}><input type="hidden" name="id" value={m.id} /><ConfirmSubmit label="Retirer" confirmLabel="Confirmer" className="btn-sm" /></form>
                </div>
                <form action={setPermissions} className="mt-3 rounded-lg bg-[#f7f7f7] p-3 sm:ml-11">
                  <input type="hidden" name="id" value={m.id} />
                  <div className="mb-2 text-xs font-[550] text-muted">Accès autorisés</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {AREAS.map((a) => (
                      <label key={a} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="perm" value={a} defaultChecked={perms.includes(a)} className="h-4 w-4 accent-[#7c3aed]" />{AREA_LABELS[a]}</label>
                    ))}
                  </div>
                  <button className="btn btn-sm mt-3">Enregistrer les accès</button>
                </form>
              </li>
            );
          })}
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
