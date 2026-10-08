import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Parnassa Pay", template: "%s · Parnassa Pay" },
  applicationName: "Parnassa Pay",
  description: "Créez votre boutique en ligne et vendez partout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${body.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
