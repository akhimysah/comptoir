import Link from "next/link";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { getCatalog } from "@/lib/storefront";
import { readTheme } from "@/lib/theme";

export default async function ThemePage() {
  const { store } = await requirePerm("content");
  const { products, collections } = await getCatalog(store.id);
  return (
    <>
      <PageHeader title="Thème" subtitle="Changez le style et les sections de votre page d'accueil. Cliquez sur une section de l'aperçu pour la modifier." actions={<Link href={`/s/${store.slug}`} target="_blank" className="btn">Voir la boutique</Link>} />
      <ThemeEditor initial={readTheme(store.theme, store.name)} store={{ slug: store.slug, name: store.name, currency: store.currency }} products={products} collections={collections} />
    </>
  );
}
