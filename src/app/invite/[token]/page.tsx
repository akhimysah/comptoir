import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { acceptInvite } from "./actions";
import { SignupFromInvite } from "./SignupFromInvite";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { findValidInvite } from "@/lib/invites";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([findValidInvite(token), getUser()]);
  const hasAccount = invite ? Boolean(await db.user.findUnique({ where: { email: invite.email }, select: { id: true } })) : false;

  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-12">
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#4ad18c] font-bold text-[#0b2e1b]">C</span>
        <span className="text-[15px] font-semibold">comptoir</span>
      </div>
      <div className="card flex w-full max-w-md flex-col gap-4 p-6">
        {!invite ? (
          <>
            <h1 className="text-lg font-bold">Invitation expirée</h1>
            <p className="text-muted">Ce lien n'est plus valable : il a déjà servi ou date de plus de 7 jours. Demandez une nouvelle invitation au propriétaire de la boutique.</p>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-bold">Rejoindre {invite.store.name}</h1>
              <p className="text-muted">{invite.invitedBy} vous invite à gérer cette boutique sur Comptoir.</p>
            </div>
            {user ? (
              user.email === invite.email ? (
                <form action={acceptInvite}>
                  <input type="hidden" name="token" value={token} />
                  <button className="btn btn-primary h-9 w-full">Accepter l'invitation</button>
                </form>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="rounded-lg bg-[#ffeb78] px-3 py-2 text-[13px] text-[#4f4700]">Vous êtes connecté avec {user.email}, mais l'invitation est pour {invite.email}.</p>
                  <form action={logout}><input type="hidden" name="next" value={`/invite/${token}`} /><button className="btn w-full">Me déconnecter</button></form>
                </div>
              )
            ) : hasAccount ? (
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(invite.email)}`} className="btn btn-primary h-9">Me connecter pour accepter</Link>
            ) : (
              <SignupFromInvite token={token} email={invite.email} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
