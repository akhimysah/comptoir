import { deleteDiscount, toggleDiscount, toggleCombine } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, parseJson } from "@/lib/utils";

export default async function DiscountsPage() {
  const { store } = await requirePerm("discounts");
  const [discounts, collections, products, segments, customers] = await Promise.all([
    db.discount.findMany({ where: { storeId: store.id, customerEmail: null }, orderBy: { createdAt: "desc" } }),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.product.findMany({ where: { storeId: store.id, isGiftCard: false }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.segment.findMany({ where: { storeId: store.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.customer.findMany({ where: { storeId: store.id }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, email: true } }),
  ]);
  const names = (list: { id: string; title: string }[], ids: string[]) => {
    const found = list.filter((x) => ids.includes(x.id)).map((x) => x.title);
    return `${found.slice(0, 3).join(", ")}${found.length > 3 ? ` et ${found.length - 3} autre(s)` : ""}`;
  };
  const scope = (d: (typeof discounts)[number]) => {
    const ids = parseJson<string[]>(d.targetIds, []);
    return d.appliesTo === "all" ? null : names(d.appliesTo === "collections" ? collections : products, ids);
  };
  /** Ligne de description comme sur Shopify : « 20 % de réduction sur Sets • Quantité minimale de 4 ». */
  const describe = (d: (typeof discounts)[number]) => {
    const on = scope(d);
    const countries = parseJson<string[]>(d.countries, []);
    const what = d.type === "free_shipping"
      ? `Livraison offerte${countries.length ? ` • Pour ${countries.length} pays` : " • Pour tous les pays"}`
      : d.type === "bxgy"
        ? `Achetez ${d.buyQty}, obtenez ${d.getQty} ${d.value >= 100 ? "offert" : `à −${d.value} %`}${d.getQty > 1 && d.value >= 100 ? "s" : ""}${on ? ` sur ${on}` : ""}`
        : `${d.type === "percent" ? `${d.value} %` : formatMoney(d.value, store.currency)} de réduction sur ${on ?? "toute la commande"}`;
    const parts = [what];
    if (d.minSubtotalCents > 0) parts.push(`Achat minimum de ${formatMoney(d.minSubtotalCents, store.currency)}`);
    if (d.minQuantity > 0) parts.push(`Quantité minimale de ${d.minQuantity}`);
    if (d.oncePerCustomer) parts.push("Une utilisation par client");
    return parts.join(" • ");
  };
  const eligibility = (d: (typeof discounts)[number]) => {
    const ids = parseJson<string[]>(d.eligibleIds, []);
    if (d.eligibility === "segments") return { label: `${ids.length} segment${ids.length > 1 ? "s" : ""}`, detail: names(segments.map((s) => ({ id: s.id, title: s.name })), ids) };
    if (d.eligibility === "customers") return { label: `${ids.length} client${ids.length > 1 ? "s" : ""}`, detail: names(customers.map((c) => ({ id: c.id, title: c.name || c.email })), ids) };
    return { label: "Tous les clients", detail: "" };
  };
  const now = new Date();
  return (
    <>
      <PageHeader title="Remises" subtitle="Codes promo à saisir dans le panier, ou remises automatiques appliquées sans code." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="card min-w-0">
          {discounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Remise</th><th className="th">Admissibilité</th><th className="th">Cumuls</th><th className="th">Utilisations</th><th className="th">Statut</th><th className="th" /></tr></thead>
                <tbody>
                  {discounts.map((d) => {
                    const expired = d.endsAt && d.endsAt < now;
                    const exhausted = d.usageLimit !== null && d.usageCount >= d.usageLimit;
                    const who = eligibility(d);
                    return (
                      <tr key={d.id}>
                        <td className="td">
                          {d.automatic ? <div className="flex items-center gap-2"><span className="font-[550]">{d.title}</span><Pill tone="info" dot={false}>Automatique</Pill></div> : <span className="font-mono font-[650]">{d.code}</span>}
                          <div className="text-xs text-muted">{describe(d)}</div>
                          {d.startsAt && d.startsAt > now && <div className="text-xs text-muted">À partir du {formatDate(d.startsAt)}</div>}
                          {d.endsAt && <div className="text-xs text-muted">Jusqu'au {formatDate(d.endsAt)}</div>}
                        </td>
                        <td className="td">{who.label}{who.detail && <div className="text-xs text-muted">{who.detail}</div>}</td>
                        <td className="td">
                          <form action={toggleCombine}><input type="hidden" name="id" value={d.id} /><button className="text-left hover:underline" title="Modifier le cumul">{d.combinesWithShipping ? (d.type === "free_shipping" ? "Remises sur les produits" : "Livraison") : <span className="text-muted">Aucun</span>}</button></form>
                        </td>
                        <td className="td num">{d.usageCount}{d.usageLimit !== null && <span className="text-muted"> / {d.usageLimit}</span>}</td>
                        <td className="td">{!d.active ? <Pill>Désactivé</Pill> : d.startsAt && d.startsAt > now ? <Pill tone="info">Programmée</Pill> : expired ? <Pill tone="bad">Expiré</Pill> : exhausted ? <Pill tone="warn">Épuisé</Pill> : <Pill tone="ok">Actif</Pill>}</td>
                        <td className="td">
                          <div className="flex justify-end gap-2">
                            <form action={toggleDiscount}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm">{d.active ? "Désactiver" : "Activer"}</button></form>
                            <form action={deleteDiscount}><input type="hidden" name="id" value={d.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer" className="btn-sm" /></form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Aucun code promo">Créez un code comme BIENVENUE10 pour offrir 10 % sur la première commande.</Empty>
          )}
        </div>
        <DiscountForm currency={store.currency} collections={collections} products={products} segments={segments.map((s) => ({ id: s.id, title: s.name }))} customers={customers.map((c) => ({ id: c.id, title: c.name || c.email, hint: c.email }))} />
      </div>
    </>
  );
}
