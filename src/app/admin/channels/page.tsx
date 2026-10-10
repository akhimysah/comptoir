import Link from "next/link";
import { CopyField } from "@/components/admin/CopyField";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { feedItems } from "@/lib/feeds";
import { appUrl } from "@/lib/stripe";
import { storeBase } from "@/lib/domains";

export default async function ChannelsPage() {
  const { store } = await requirePerm("content");
  const feed = (await feedItems(store.slug))!;
  const noImage = new Set(feed.items.filter((i) => !i.image).map((i) => i.groupId)).size;
  const products = new Set(feed.items.map((i) => i.groupId)).size;
  const local = appUrl().includes("localhost");
  const channels = [
    {
      name: "Google Shopping", url: `${storeBase(store)}/feeds/google.xml`, where: "Google Merchant Center → Produits → Sources de données → Ajouter un flux → « Récupération planifiée »",
      help: "https://merchants.google.com",
    },
    {
      name: "Facebook et Instagram", url: `${storeBase(store)}/feeds/meta.csv`, where: "Meta Commerce Manager → Catalogue → Sources de données → Flux de données → « Récupération planifiée »",
      help: "https://business.facebook.com/commerce",
    },
  ];
  return (
    <>
      <PageHeader title="Google et réseaux sociaux" subtitle="Montrez vos produits dans Google Shopping, Facebook et Instagram. Le catalogue se met à jour tout seul : prix, stock et nouveaux produits." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Produits dans le catalogue</div><div className="text-lg font-bold">{products}</div><div className="text-xs text-muted">{feed.items.length} variantes, hors cartes cadeaux et brouillons</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Sans photo</div><div className="text-lg font-bold">{noImage}</div><div className="text-xs text-muted">Google et Meta refusent les produits sans photo</div></div>
        <div className="card p-4"><div className="text-xs font-[550] text-muted">Mise à jour</div><div className="text-lg font-bold">Automatique</div><div className="text-xs text-muted">relu par Google et Meta chaque jour</div></div>
      </div>
      {local && <p className="card bg-[#fff8db] px-4 py-3 text-[13px]">La plateforme tourne sur votre ordinateur : Google et Meta ne peuvent pas encore lire ces adresses. Elles fonctionneront une fois le site mis en ligne.</p>}
      {noImage > 0 && <p className="card px-4 py-3 text-[13px]">{noImage} produit{noImage > 1 ? "s n'ont" : " n'a"} pas de photo : <Link href="/admin/products" className="text-pine hover:underline">ajoutez-en dans Produits</Link> pour qu'ils soient acceptés.</p>}
      {channels.map((c) => (
        <section key={c.name} className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-[650]">{c.name}</h2><Pill tone={local ? "neutral" : "ok"}>{local ? "Prêt pour la mise en ligne" : "Flux actif"}</Pill></div>
          <CopyField value={c.url} label={`Adresse du flux ${c.name}`} />
          <p className="text-[13px] text-muted">Collez cette adresse dans <b className="font-[550] text-ink">{c.where}</b>. <a href={c.help} target="_blank" rel="noopener noreferrer" className="text-pine hover:underline">Ouvrir</a></p>
        </section>
      ))}
    </>
  );
}
