import { NewStoreForm } from "./NewStoreForm";
import { PageHeader } from "@/components/ui";
import { requireStore } from "@/lib/auth";

export default async function NewStorePage() {
  const { stores } = await requireStore();
  return (
    <>
      <PageHeader back="/admin/overview" title="Créer une boutique" subtitle={`Vous gérez déjà ${stores.length} boutique${stores.length > 1 ? "s" : ""}. Chaque boutique a ses propres produits, commandes, thème et paramètres ; leurs chiffres sont regroupés dans « Toutes les boutiques ».`} />
      <NewStoreForm />
    </>
  );
}
