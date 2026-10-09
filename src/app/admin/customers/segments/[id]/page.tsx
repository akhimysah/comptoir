import { notFound } from "next/navigation";
import { deleteSegment } from "../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { SegmentEditor } from "@/components/admin/SegmentEditor";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { segmentRules, splitTags } from "@/lib/segments";

export default async function SegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("customers");
  const seg = id === "new" ? null : await db.segment.findFirst({ where: { id, storeId: store.id } });
  if (id !== "new" && !seg) notFound();
  const [products, customers] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.customer.findMany({ where: { storeId: store.id, tags: { not: "" } }, select: { tags: true } }),
  ]);
  const tags = [...new Set(customers.flatMap((c) => splitTags(c.tags)))].sort();
  return (
    <>
      <PageHeader
        back="/admin/customers/segments"
        title={seg ? seg.name : "Nouveau segment"}
        actions={seg && <form action={deleteSegment}><input type="hidden" name="id" value={seg.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Confirmer la suppression" /></form>}
      />
      <SegmentEditor
        id={seg?.id}
        initial={seg ? { name: seg.name, match: seg.match === "any" ? "any" : "all", rules: segmentRules(seg) } : { name: "", match: "all", rules: [{ field: "orders", op: "gte", value: "1" }] }}
        products={products}
        tags={tags}
        currency={store.currency}
      />
    </>
  );
}
