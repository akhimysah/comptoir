import { notFound } from "next/navigation";
import { deleteCampaign, sendCampaign, sendTest } from "../actions";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { campaignRecipients } from "@/lib/marketing";
import { formatDateTime, parseJson } from "@/lib/utils";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ test?: string; err?: string }> }) {
  const [{ id }, { test, err }] = await Promise.all([params, searchParams]);
  const { user, store } = await requirePerm("marketing");
  const c = id === "new" ? null : await db.campaign.findFirst({ where: { id, storeId: store.id } });
  if (id !== "new" && !c) notFound();
  const [products, all, segments] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: "active" }, orderBy: { title: "asc" } }),
    campaignRecipients(store.id, null),
    db.segment.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const audiences = [
    { id: null, label: "Tous les abonnés", count: all!.length },
    ...(await Promise.all(segments.map(async (s) => ({ id: s.id, label: `Segment « ${s.name} »`, count: (await campaignRecipients(store.id, s.id))?.length ?? 0 })))),
  ];
  const audience = audiences.find((a) => a.id === (c?.segmentId ?? null)) ?? audiences[0];
  const subscribers = audience.count;
  const sent = c?.status !== "draft" && !!c;
  return (
    <>
      <PageHeader
        back="/admin/marketing"
        title={c?.subject ?? "Nouvelle campagne"}
        subtitle={sent ? `Envoyée le ${c!.sentAt ? formatDateTime(c!.sentAt) : "…"} à ${c!.recipients} abonné(s)` : c ? `${subscribers} abonné${subscribers > 1 ? "s" : ""} recevront cet e-mail${audience.id ? ` (${audience.label})` : ""}` : undefined}
        actions={c && !sent && (
          <>
            <form action={sendTest}><input type="hidden" name="id" value={c.id} /><button className="btn">M'envoyer un test</button></form>
            <form action={deleteCampaign}><input type="hidden" name="id" value={c.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" /></form>
            <form action={sendCampaign}><input type="hidden" name="id" value={c.id} /><ConfirmSubmit label={`Envoyer à ${subscribers} abonné${subscribers > 1 ? "s" : ""}`} confirmLabel="Confirmer l'envoi" className="border-0 bg-[linear-gradient(180deg,#303030,#1a1a1a)] text-white hover:bg-[#303030]" /></form>
          </>
        )}
      />
      {test && <p role="status" className="card bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Test envoyé à {user.email}{process.env.RESEND_API_KEY ? "" : " (visible dans Paramètres → Notifications tant qu'aucun service d'e-mail n'est configuré)"}.</p>}
      {err === "segment" && <p role="alert" className="card bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">Le segment choisi n'existe plus : choisissez d'autres destinataires avant d'envoyer.</p>}
      {sent && <p className="card px-4 py-3 text-[13px]"><Pill tone="ok">Envoyée</Pill> <span className="ml-2">Une campagne envoyée ne peut plus être modifiée.</span></p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <CampaignForm
          key={c?.updatedAt.toISOString() ?? "new"}
          readOnly={sent}
          products={products.map((p) => ({ id: p.id, title: p.title, hue: p.hue, image: parseJson<string[]>(p.images, [])[0] ?? null }))}
          initial={{ id: c?.id, subject: c?.subject ?? "", title: c?.title ?? "", body: c?.body ?? "", buttonText: c?.buttonText ?? "Découvrir", productIds: c ? parseJson<string[]>(c.productIds, []) : [], segmentId: c?.segmentId ?? null }}
          audiences={audiences}
        />
        {c && (
          <section className="card overflow-hidden">
            <div className="card-h"><h2 className="text-sm font-[650]">Aperçu</h2></div>
            <iframe title="Aperçu de la campagne" src={`/admin/marketing/${c.id}/preview?v=${c.updatedAt.getTime()}`} className="h-[640px] w-full bg-[#f1f1f1]" />
          </section>
        )}
      </div>
    </>
  );
}
