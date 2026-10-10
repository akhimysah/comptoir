import Link from "next/link";
import { Logo } from "@/components/Logo";
import { platform } from "@/lib/platform";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-[#303030]">
      <header className="border-b border-[#ebebeb]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/"><Logo size={32} nameClassName="text-base text-[#303030]" /></Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/legal/cgu" className="hover:underline">Conditions</Link>
            <Link href="/legal/confidentialite" className="hover:underline">Confidentialité</Link>
            <Link href="/legal/mentions-legales" className="hover:underline">Mentions légales</Link>
          </nav>
        </div>
      </header>
      {!platform.legalValidated && (
        <p className="bg-[#fff8db] px-4 py-2 text-center text-xs">Brouillon : ce texte doit être relu et validé par un professionnel du droit avant la mise en ligne.</p>
      )}
      <main className="legal mx-auto max-w-3xl px-4 py-10 text-[15px] leading-relaxed [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3">{children}</main>
    </div>
  );
}
