import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getUser } from "@/lib/auth";

const FEATURES = [
  { t: "Votre boutique en 2 minutes", d: "Un nom, une adresse en ligne, et votre vitrine est prête. Ajoutez vos produits avec photos, tailles et couleurs." },
  { t: "Paiement par carte", d: "Carte bancaire, Apple Pay et Google Pay grâce à Stripe. L'argent arrive directement sur votre compte." },
  { t: "Un design à votre image", d: "Choisissez un thème, changez couleurs, polices et sections, et voyez le résultat en direct." },
  { t: "Toutes vos boutiques, un seul tableau de bord", d: "Commandes, stock, clients, remises, factures et chiffre d'affaires jour par jour, pour une ou plusieurs boutiques." },
];

const primary = "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#8b5cf6,#6d28d9)] px-5 py-3 font-semibold text-white shadow-[0_8px_24px_-8px_rgba(124,58,237,.8)] transition hover:brightness-110";
const ghost = "inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 font-semibold text-white transition hover:bg-white/10";

export default async function Home() {
  const user = await getUser();
  return (
    <div className="min-h-screen bg-[#0d0730] text-white">
      <div className="bg-[radial-gradient(ellipse_at_top_left,#4c1d95_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#3b0fa8_0%,transparent_50%)]">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Link href="/"><Logo size={36} nameClassName="text-lg" /></Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/admin" className={primary.replace("px-5 py-3", "px-4 py-2")}>Mon admin</Link>
            ) : (
              <>
                <Link href="/login" className="rounded-xl px-4 py-2 font-semibold text-white/80 hover:text-white">Se connecter</Link>
                <Link href="/signup" className={primary.replace("px-5 py-3", "px-4 py-2")}>Créer ma boutique</Link>
              </>
            )}
          </nav>
        </header>

        <main>
          <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
            <div className="flex flex-col gap-6">
              <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#c4b5fd]">Commerce en ligne, sans prise de tête</span>
              <h1 className="text-4xl font-bold leading-[1.05] md:text-6xl">Ouvrez votre boutique.<br /><span className="bg-[linear-gradient(90deg,#c4b5fd,#8b5cf6)] bg-clip-text text-transparent">Vendez dès ce soir.</span></h1>
              <p className="max-w-[52ch] text-lg text-white/70">
                Parnassa Pay réunit tout ce qu'il faut pour vendre en ligne : vitrine personnalisable, paiement sécurisé, gestion du stock, des commandes et de toutes vos boutiques.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup" className={primary}>Créer ma boutique gratuitement</Link>
                <Link href="/s/atelier-argile" className={ghost}>Voir une boutique exemple</Link>
              </div>
              <p className="text-sm text-white/50">Sans abonnement. Une commission de {process.env.PLATFORM_FEE_PERCENT ?? "2"} % seulement sur les ventes.</p>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-8 rounded-full bg-[#7c3aed] opacity-30 blur-3xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/parnassa-pay.jpg" alt="Parnassa Pay" className="relative w-full rounded-[2rem] shadow-[0_40px_80px_-30px_rgba(0,0,0,.8)]" />
            </div>
          </section>
        </main>
      </div>

      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-10 px-4 py-16 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.t} className="flex flex-col gap-2">
              <span className="h-1 w-10 rounded-full bg-[linear-gradient(90deg,#c4b5fd,#7c3aed)]" />
              <h2 className="text-xl font-bold">{f.t}</h2>
              <p className="max-w-[48ch] text-white/65">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl items-center justify-between px-4 py-8 text-sm text-white/50">
        <Logo size={24} nameClassName="text-white/80" />
        <span className="flex flex-wrap gap-4">
          <Link href="/legal/cgu" className="hover:text-white">Conditions</Link>
          <Link href="/legal/confidentialite" className="hover:text-white">Confidentialité</Link>
          <Link href="/legal/mentions-legales" className="hover:text-white">Mentions légales</Link>
          <span>© {new Date().getFullYear()} Parnassa Pay</span>
        </span>
      </footer>
    </div>
  );
}
