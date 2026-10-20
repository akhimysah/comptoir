import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

/** E-mail envoyé au client pour cette commande, tel qu'il a été expédié (rendu isolé : aucun script ne s'exécute). */
export default async function OrderEmailPage({ params }: { params: Promise<{ id: string; mailId: string }> }) {
  const { id, mailId } = await params;
  const { store } = await requirePerm("orders");
  const o = await db.order.findFirst({ where: { id, storeId: store.id }, select: { id: true, number: true, email: true } });
  if (!o) notFound();
  // L'e-mail doit appartenir à la boutique ET avoir été adressé au client de cette commande.
  const mail = await db.mailLog.findFirst({ where: { id: mailId, storeId: store.id, to: o.email } });
  if (!mail) notFound();

  return (
    <>
      <PageHeader back={`/admin/orders/${o.id}`} title={mail.subject} subtitle={`Envoyé à ${mail.to} le ${formatDateTime(mail.createdAt)} · commande #${o.number}${mail.status === "failed" ? " · échec de l'envoi" : mail.status === "logged" ? " · non envoyé (journal seulement)" : ""}`} />
      {mail.error && <p role="alert" className="mb-4 rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{mail.error}</p>}
      <div className="card overflow-hidden">
        <iframe srcDoc={mail.html} sandbox="" title={mail.subject} className="h-[80vh] w-full bg-white" />
      </div>
    </>
  );
}
