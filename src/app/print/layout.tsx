export const metadata = { robots: { index: false } };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#e9e9e9] py-8 text-[#111] print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm } @media print { .sheet { box-shadow: none !important; margin: 0 !important; break-after: page } .sheet:last-child { break-after: auto } }`}</style>
      {children}
    </div>
  );
}
