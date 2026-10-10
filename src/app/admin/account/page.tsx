import QRCode from "qrcode";
import { beginSetup, cancelSetup } from "./actions";
import { ConfirmSetupForm, DisableForm, RegenerateForm } from "@/components/admin/TwoFactorForms";
import { PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { otpauthUrl } from "@/lib/totp";

export const metadata = { title: "Sécurité du compte" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const { recovery } = await searchParams;
  const session = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: session.id } });
  const remaining = JSON.parse(user.recoveryCodes || "[]").length as number;
  const qr = user.totpPending ? await QRCode.toDataURL(otpauthUrl(user.totpPending, user.email), { margin: 1, width: 200 }) : null;
  const key = user.totpPending?.replace(/(.{4})/g, "$1 ").trim();

  return (
    <>
      <PageHeader title="Sécurité du compte" subtitle={`${user.name} · ${user.email}`} />
      {recovery && <p role="alert" className="card mb-4 bg-[#fffbe6] px-4 py-3 text-[13px]">Vous vous êtes connecté avec un code de secours. Il vous en reste {remaining}. Pensez à en générer de nouveaux ci-dessous.</p>}
      <section className="card flex max-w-2xl flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-[650]">Double authentification</h2>
          {user.totpEnabled ? <Pill tone="ok">Activée</Pill> : <Pill tone="attention">Désactivée</Pill>}
        </div>
        <p className="text-[13px] text-muted">À la connexion, en plus du mot de passe, un code à 6 chiffres est demandé : il est généré par une application sur votre téléphone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Même si quelqu'un vole votre mot de passe, il ne peut pas se connecter.</p>

        {user.totpEnabled ? (
          <>
            <p className="text-[13px]">Codes de secours restants : <b>{remaining}</b> sur 10.</p>
            <div className="border-t border-line pt-4"><RegenerateForm /></div>
            <div className="border-t border-line pt-4"><DisableForm /></div>
          </>
        ) : user.totpPending ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="QR code à scanner avec votre application d'authentification" width={200} height={200} className="rounded-lg border border-line" />}
              <div className="flex flex-col gap-2 text-[13px]">
                <p><b>1.</b> Installez une application d'authentification sur votre téléphone.</p>
                <p><b>2.</b> Scannez ce QR code avec l'application. Sans appareil photo, saisissez cette clé :</p>
                <code className="w-fit rounded-md bg-[#f1f1f1] px-2 py-1 font-mono text-[13px] tracking-wider">{key}</code>
              </div>
            </div>
            <ConfirmSetupForm />
            <form action={cancelSetup}><button className="text-[13px] text-muted hover:underline">Annuler</button></form>
          </div>
        ) : (
          <form action={beginSetup}><button className="btn btn-primary">Activer la double authentification</button></form>
        )}
      </section>
    </>
  );
}
