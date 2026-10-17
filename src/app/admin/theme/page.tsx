import Link from "next/link";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { CustomCssForm } from "@/components/admin/CustomCssForm";
import { GithubCard } from "@/components/admin/GithubCard";
import { ThemeZipCard } from "@/components/admin/ThemeZipCard";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { getCatalog } from "@/lib/storefront";
import { readTheme } from "@/lib/theme";

export default async function ThemePage({ searchParams }: { searchParams: Promise<{ ghok?: string; gherr?: string; zipok?: string; ziperr?: string }> }) {
  const { ghok, gherr, zipok, ziperr } = await searchParams;
  const { store, isOwner } = await requirePerm("content");
  const { products, collections } = await getCatalog(store.id);
  return (
    <>
      <PageHeader title="Thème" subtitle="Changez le style et les sections de votre page d'accueil. Cliquez sur une section de l'aperçu pour la modifier." actions={<Link href={`/s/${store.slug}`} target="_blank" className="btn">Voir la boutique</Link>} />
      <ThemeEditor initial={readTheme(store.theme, store.name)} store={{ slug: store.slug, name: store.name, currency: store.currency }} products={products} collections={collections} />
      <CustomCssForm css={store.customCss} slug={store.slug} />
      <ThemeZipCard ok={zipok} err={ziperr} />
      {isOwner && <GithubCard store={store} ok={ghok} err={gherr} />}
    </>
  );
}
