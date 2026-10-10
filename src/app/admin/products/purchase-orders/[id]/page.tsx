import { notFound } from "next/navigation";
import { cancelPurchaseOrder, markOrdered, receivePurchaseOrder } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PurchaseOrderEditor } from "@/components/admin/PurchaseOrderEditor";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { centsToInput, formatMoney } from "@/lib/money";
import { PO_STATUS, poTotal } from "@/lib/purchasing";
import { formatDate, formatDateTime, parseJson } from "@/lib/utils";

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; err?: string; received?: string }> }) {
  const [{ id }, { saved, err, received }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("products");
  const po = id === "new" ? null : await db.purchaseOrder.findFirst({ where: { id, storeId: store.id }, include: { items: true, supplier: true } });
  if (id !== "new" && !po) notFound();
  const m = (c: number) => formatMoney(c, store.currency);

  if (!po || po.status === "draft") {
    const [suppliers, products] = await Promise.all([
      db.supplier.findMany({ where: { storeId: store.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.product.findMany({ where: { storeId: store.id, isGiftCard: false, status: { not: "archived" } }, include: { variants: { orderBy: { position: "asc" } } }, orderBy: { title: "asc" } }),
    ]);
    const bundles = new Set((await db.bundleItem.findMany({ where: { bundleId: { in: products.map((p) => p.id) } }, select: { bundleId: true } })).map((b) => b.bundleId));
    const variants = products.filter((p) => !bundles.has(p.id)).flatMap((p) => p.variants.map((v) => ({
      id: v.id, title: p.title, variant: v.title, sku: v.sku, stock: v.stock, costCents: v.costCents, image: parseJson<string[]>(p.images, [])[0] ?? null, hue: p.hue,
      low: p.status === "active" && !p.continueSelling && v.stock <= store.lowStockThreshold,
    })));
    return (
      <>
        <PageHeader
          back="/admin/products/purchase-orders"
          title={po ? `Bon de commande n° ${po.number}` : "Nouveau bon de commande"}
          subtitle={po ? "Brouillon : vérifiez-le puis passez la commande." : undefined}
          actions={po && (
            <>
              <form action={cancelPurchaseOrder}><input type="hidden" name="id" value={po.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer la suppression" /></form>
              {po.items.length > 0 && (
                <form action={markOrdered} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={po.id} />
                  {po.supplier?.email && <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-[#7c3aed]" />Envoyer à {po.supplier.email}</label>}
                  <button className="btn btn-primary">Marquer comme commandé</button>
                </form>
              )}
            </>
          )}
        />
        {saved && <p role="status" className="card mb-4 bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Brouillon enregistré.</p>}
        <PurchaseOrderEditor
          key={po?.updatedAt.toISOString() ?? "new"}
          suppliers={suppliers}
          variants={variants}
          currency={store.currency}
          threshold={store.lowStockThreshold}
          initial={{
            id: po?.id, supplierId: po?.supplierId ?? null, expectedAt: po?.expectedAt ? po.expectedAt.toISOString().slice(0, 10) : "",
            shipping: po?.shippingCents ? centsToInput(po.shippingCents) : "", note: po?.note ?? "",
            lines: po?.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity, cost: centsToInput(i.costCents) })) ?? [],
          }}
        />
      </>
    );
  }

  const st = PO_STATUS[po.status as keyof typeof PO_STATUS] ?? PO_STATUS.draft;
  const receiving = ["ordered", "partial"].includes(po.status);
  return (
    <>
      <PageHeader
        back="/admin/products/purchase-orders"
        title={`Bon de commande n° ${po.number}`}
        subtitle={[po.supplier?.name, po.orderedAt && `commandé le ${formatDate(po.orderedAt)}`, po.expectedAt && `livraison prévue le ${formatDate(po.expectedAt)}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <a href={`/print/purchase-order/${po.id}`} target="_blank" className="btn">Imprimer</a>
            {receiving && <form action={cancelPurchaseOrder}><input type="hidden" name="id" value={po.id} /><ConfirmSubmit label="Annuler le bon" confirmLabel="Confirmer l'annulation" /></form>}
            <Pill tone={st.tone}>{st.label}</Pill>
          </>
        }
      />
      {received && <p role="status" className="card mb-4 bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">{received} article(s) ajouté(s) au stock.</p>}
      {err && <p role="alert" className="card mb-4 bg-[#fedad9] px-4 py-3 text-[13px] text-[#8e0b21]">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <form action={receivePurchaseOrder} className="card min-w-0 overflow-hidden">
          <input type="hidden" name="id" value={po.id} />
          <div className="card-h"><h2 className="text-sm font-[650]">{receiving ? "Réception des articles" : "Articles"}</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">Article</th><th className="th">Commandé</th><th className="th">Reçu</th>{receiving && <th className="th">Reçu aujourd'hui</th>}<th className="th text-right">Coût</th></tr></thead>
              <tbody>
                {po.items.map((i) => {
                  const left = Math.max(0, i.quantity - i.received);
                  return (
                    <tr key={i.id}>
                      <td className="td"><div className="font-[550]">{i.productTitle}</div><div className="text-xs text-muted">{i.variantTitle !== "Par défaut" ? i.variantTitle : ""}{i.sku ? ` ${i.sku}` : ""}</div></td>
                      <td className="td num">{i.quantity}</td>
                      <td className="td num">{i.received >= i.quantity ? <Pill tone="ok">{i.received}</Pill> : i.received}</td>
                      {receiving && <td className="td">{left > 0 ? <input name={`rec_${i.id}`} type="number" min={0} max={left} defaultValue={left} aria-label={`Quantité reçue ${i.productTitle}`} className="input num w-20" /> : <span className="text-xs text-muted">Complet</span>}</td>}
                      <td className="td num text-right">{m(i.costCents * i.quantity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {receiving && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="updateCosts" defaultChecked className="h-4 w-4 accent-[#7c3aed]" />Mettre à jour le coût par article des produits</label>
              <button className="btn btn-primary">Ajouter au stock</button>
            </div>
          )}
        </form>
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-1 p-4 text-[13px]">
            <h2 className="mb-1 text-sm font-[650]">Fournisseur</h2>
            {po.supplier ? <><div className="font-[550]">{po.supplier.name}</div>{po.supplier.email && <div className="text-pine">{po.supplier.email}</div>}</> : <div className="text-muted">Aucun</div>}
          </section>
          <section className="card p-4">
            <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px]">
              <dt className="text-muted">Articles</dt><dd className="num text-right">{m(poTotal({ ...po, shippingCents: 0 }))}</dd>
              <dt className="text-muted">Frais de port</dt><dd className="num text-right">{m(po.shippingCents)}</dd>
              <dt className="font-[650]">Total</dt><dd className="num text-right font-[650]">{m(poTotal(po))}</dd>
            </dl>
          </section>
          {po.note && <section className="card p-4 text-[13px]"><h2 className="mb-1 text-sm font-[650]">Note</h2><p className="whitespace-pre-line text-muted">{po.note}</p></section>}
          {po.receivedAt && <p className="px-1 text-xs text-muted">Entièrement reçu le {formatDateTime(po.receivedAt)}.</p>}
        </aside>
      </div>
    </>
  );
}
