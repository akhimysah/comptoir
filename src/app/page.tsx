import Link from "next/link";
import { getUser } from "@/lib/auth";

const FEATURES = [
  { t: "Votre boutique en 2 minutes", d: "Un nom, une adresse en ligne, et votre vitrine est prête. Ajoutez vos produits avec photos, tailles et couleurs." },
  { t: "Paiement par carte", d: "Carte bancaire, Apple Pay et Google Pay grâce à Stripe. L'argent arrive directement sur votre compte." },
  { t: "Un design à votre image", d: "Choisissez un thème, changez couleurs, polices et sections, et voyez le résultat en direct." },
  { t: "Tout piloter au même endroit", d: "Commandes, stock, clients, codes promo et chiffre d'affaires dans un seul tableau de bord." },
];

export default async function Home() {
  const user = await getUser();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-pine font-display font-bold text-white">C</span>
          <span className="font-display text-lg font-bold">Comptoir</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/admin" className="btn btn-primary">Mon admin</Link>
          ) : (
            <>
              <Link href="/login" className="btn border-transparent bg-transparent">Se connecter</Link>
              <Link href="/signup" className="btn btn-primary">Créer ma boutique</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div className="flex flex-col gap-6">
            <span className="eyebrow">Commerce en ligne, sans prise de tête</span>
            <h1 className="text-4xl font-bold leading-[1.05] md:text-6xl">Ouvrez votre boutique. Vendez dès ce soir.</h1>
            <p className="max-w-[52ch] text-lg text-muted">
              Comptoir réunit tout ce qu'il faut pour vendre en ligne : vitrine personnalisable, paiement sécurisé, gestion du stock et des commandes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-primary px-5 py-3 text-base">Créer ma boutique gratuitement</Link>
              <Link href="/s/atelier-argile" className="btn px-5 py-3 text-base">Voir une boutique exemple</Link>
            </div>
            <p className="text-sm text-muted">Sans abonnement. Une commission de {process.env.PLATFORM_FEE_PERCENT ?? "2"} % seulement sur les ventes.</p>
          </div>
          <div className="card overflow-hidden shadow-[0_30px_60px_-30px_rgba(19,34,28,.35)]">
            <div className="flex items-center gap-1.5 border-b border-line bg-[#F6F8F7] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E4A3A3]" /><span className="h-2.5 w-2.5 rounded-full bg-[#E9CF8E]" /><span className="h-2.5 w-2.5 rounded-full bg-[#9FCDB0]" />
              <span className="ml-3 font-mono text-xs text-muted">comptoir.app/s/atelier-argile</span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5">
              {[32, 150, 222, 12].map((h, i) => (
                <div key={h} className="flex flex-col gap-2">
                  <div className="aspect-[4/3] rounded-lg" style={{ background: `linear-gradient(140deg, hsl(${h} 42% 80%), hsl(${h + 30} 44% 58%))` }} />
                  <div className="h-2.5 w-2/3 rounded bg-[#E3EAE5]" />
                  <div className="num text-sm font-semibold">{["22,00 €", "28,00 €", "32,00 €", "45,00 €"][i]}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-8 px-4 py-16 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.t} className="flex flex-col gap-2">
                <h2 className="text-xl font-bold">{f.t}</h2>
                <p className="max-w-[48ch] text-muted">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">© {new Date().getFullYear()} Comptoir</footer>
    </div>
  );
}
