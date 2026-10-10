import { CustomerImportForm } from "@/components/admin/CustomerImportForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";

export default async function CustomerImportPage() {
  await requirePerm("customers");
  return (
    <>
      <PageHeader back="/admin/customers" title="Importer des clients" />
      <CustomerImportForm />
    </>
  );
}
