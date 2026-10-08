import Link from "next/link";
import { findReset } from "@/lib/password-reset";
import { ResetForm } from "./ResetForm";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findReset(token))) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Lien expiré</h1>
        <p className="text-muted">Ce lien a déjà servi ou date de plus d'une heure.</p>
        <Link href="/forgot" className="btn btn-primary">Refaire une demande</Link>
      </div>
    );
  }
  return <ResetForm token={token} />;
}
