import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <Logo size={44} />
      </Link>
      <div className="card w-full max-w-md p-6 sm:p-8">{children}</div>
      <nav className="mt-6 flex gap-4 text-xs text-muted">
        <Link href="/legal/cgu" className="hover:underline">Conditions</Link>
        <Link href="/legal/confidentialite" className="hover:underline">Confidentialité</Link>
        <Link href="/legal/mentions-legales" className="hover:underline">Mentions légales</Link>
      </nav>
    </div>
  );
}
