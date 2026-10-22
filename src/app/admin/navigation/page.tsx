import { addMenu, deleteMenu, deleteRedirect } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { MenuEditor } from "@/components/admin/MenuEditor";
import { RedirectForm } from "@/components/admin/RedirectForm";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeMenus } from "@/lib/navigation";

export default async function NavigationPage() {
  const { store } = await requirePerm("content");
  const [menus, collections, products, pages, posts, redirects] = await Promise.all([
    storeMenus(store),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.product.findMany({ where: { storeId: store.id, status: "active" }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.page.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.blogPost.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.redirect.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const options = { collections, products, pages, posts };
  return (
    <>
      <PageHeader title="Navigation" subtitle="Les menus de votre boutique en ligne et les redirections d'adresses. Comme sur Shopify, créez autant de menus que nécessaire : les thèmes les proposent dans leurs réglages (identifiant entre parenthèses)." />
      <div className="flex flex-col gap-4">
        <MenuEditor menuKey="main" title="Menu principal" hint="En haut de chaque page. Un sous-lien apparaît dans un menu déroulant sous le lien au-dessus de lui." initial={menus.main} options={options} />
        <MenuEditor menuKey="footer" title="Menu du pied de page" hint="En bas de chaque page : mentions légales, contact, livraison…" initial={menus.footer} options={options} />
        {menus.extra.map((m) => (
          <div key={m.handle} className="relative">
            <MenuEditor menuKey={m.handle} title={`${m.title} (${m.handle})`} hint="Menu supplémentaire : à choisir dans les réglages des sections de votre thème (pied de page, liens rapides, menu mobile…)." initial={m.items} options={options} />
            <form action={deleteMenu} className="absolute right-4 top-3"><input type="hidden" name="handle" value={m.handle} /><ConfirmSubmit label="Supprimer le menu" confirmLabel={`Supprimer « ${m.title} »`} className="h-8" /></form>
          </div>
        ))}
        <form action={addMenu} className="card flex flex-wrap items-end gap-3 p-4">
          <label className="label flex-1">Nouveau menu<span className="hint">Ex. « Liens rapides », « Aide », « Menu mobile ». L'identifiant est créé d'après le nom.</span><input name="title" required maxLength={60} placeholder="Nom du menu" className="input" /></label>
          <button className="btn">Ajouter un menu</button>
        </form>
        <section className="card overflow-hidden">
          <div className="card-h flex-col items-start gap-0.5">
            <h2 className="text-sm font-[650]">Redirections d'URL</h2>
            <p className="text-xs text-muted">Quand vous renommez un produit, une collection ou une page, l'ancienne adresse est redirigée automatiquement : vos liens partagés et votre référencement Google restent valables.</p>
          </div>
          <RedirectForm slug={store.slug} />
          {redirects.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr><th className="th">Ancienne adresse</th><th className="th">Nouvelle adresse</th><th className="th text-right">Visites</th><th className="th" /></tr></thead>
                <tbody>
                  {redirects.map((r) => (
                    <tr key={r.id} className="hover:bg-[#f7f7f7]">
                      <td className="td break-all font-mono text-[12px]">{r.fromPath}</td>
                      <td className="td break-all font-mono text-[12px]">{r.toPath}</td>
                      <td className="td num text-right">{r.hits}</td>
                      <td className="td text-right">
                        <form action={deleteRedirect}><input type="hidden" name="id" value={r.id} /><button className="text-[13px] text-[#8e0b21] hover:underline" aria-label={`Supprimer la redirection ${r.fromPath}`}>Supprimer</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-muted">Aucune redirection pour le moment.</p>
          )}
        </section>
      </div>
    </>
  );
}
