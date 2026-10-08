import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-pine font-display font-bold text-white">C</span>
        <span className="font-display text-lg font-bold">Comptoir</span>
      </Link>
      <div className="card w-full max-w-md p-6 sm:p-8">{children}</div>
    </div>
  );
}
