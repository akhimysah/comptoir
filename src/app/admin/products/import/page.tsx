import { ImportForm } from "@/components/admin/ImportForm";
import { PageHeader } from "@/components/ui";
import { requireStore } from "@/lib/auth";

export default async function ImportPage() {
  await requireStore();
  return (
    <>
      <PageHeader back="/admin/products" title="Importer des produits" subtitle="Ajoutez ou mettez à jour plusieurs produits d'un coup avec un fichier CSV." />
      <ImportForm />
    </>
  );
}
