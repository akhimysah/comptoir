"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { confirmSetup, disableTwoFactor, regenerateCodes, type TwoFaState } from "@/app/admin/account/actions";
import { keepOnSubmit } from "@/lib/keep-form";

function Codes({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#ffeb78] bg-[#fffbe6] p-3">
      <p className="text-[13px] font-[650]">Vos codes de secours : notez-les maintenant, ils ne seront plus affichés.</p>
      <p className="text-xs text-muted">Chacun permet une connexion si vous n'avez plus votre téléphone.</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-[13px]">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <button type="button" onClick={() => navigator.clipboard.writeText(codes.join("\n"))} className="btn btn-sm self-start">Copier les codes</button>
    </div>
  );
}

const Feedback = ({ state }: { state: TwoFaState }) => (
  <>
    {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
    {state?.done && <p role="status" className="text-[13px] font-[550] text-[#0c5132]">{state.done}</p>}
    {state?.codes && <Codes codes={state.codes} />}
  </>
);

const codeInput = <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={11} placeholder="123456" aria-label="Code à 6 chiffres" className="input w-36 text-center font-mono tracking-[0.25em]" />;

export function ConfirmSetupForm() {
  const [state, action, pending] = useActionState(confirmSetup, undefined);
  const router = useRouter();
  if (state?.codes) return <div className="flex flex-col gap-3"><Feedback state={state} /><button type="button" onClick={() => router.refresh()} className="btn btn-primary self-start">J'ai noté mes codes, terminer</button></div>;
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-2">
      <label className="text-[13px] font-[550]">3. Saisissez le code affiché par l'application</label>
      <div className="flex gap-2">{codeInput}<button className="btn btn-primary" disabled={pending}>{pending ? "…" : "Activer"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function RegenerateForm() {
  const [state, action, pending] = useActionState(regenerateCodes, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-2">
      <p className="text-[13px]">Nouveaux codes de secours (les anciens seront désactivés) :</p>
      <div className="flex gap-2">{codeInput}<button className="btn" disabled={pending}>Générer</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function DisableForm() {
  const [state, action, pending] = useActionState(disableTwoFactor, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-2">
      <p className="text-[13px]">Désactiver la double authentification :</p>
      <div className="flex flex-wrap gap-2">
        <input name="password" type="password" required autoComplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe" className="input w-44" />
        {codeInput}
        <button className="btn text-[#8e0b21]" disabled={pending}>Désactiver</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
