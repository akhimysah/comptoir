import "server-only";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "./db";
import { splitTags } from "./segments";

/** Colonnes de l'export / import clients de Parnassa Pay. */
export const CUSTOMER_COLUMNS = ["Nom", "E-mail", "Abonné newsletter", "Étiquettes", "Note", "Téléphone", "Adresse", "Code postal", "Ville", "Pays"] as const;

type Row = { name: string; email: string; marketing: boolean; tags: string; note: string; phone: string; line1: string; zip: string; city: string; country: string };

const yes = (v: string) => /^(oui|yes|true|1|subscribed|abonné)$/i.test(v.trim());
const COUNTRY: Record<string, string> = { FR: "France", BE: "Belgique", CH: "Suisse", LU: "Luxembourg", CA: "Canada", MA: "Maroc", DE: "Allemagne", ES: "Espagne", IT: "Italie", GB: "Royaume-Uni", US: "États-Unis", NL: "Pays-Bas", PT: "Portugal" };

/** Lit un export clients Shopify (anciennes et nouvelles colonnes) ou le format Parnassa Pay. */
export function readCustomerTable(table: string[][]): { rows: (Row & { line: number })[]; shopify: boolean } | { error: string } {
  const header = (table[0] ?? []).map((h) => h.trim());
  // L'apostrophe de tête (protection Excel des exports, ex. « '+33… » ou « '69002 ») est retirée.
  const at = (row: string[], ...names: string[]) => { for (const n of names) { const i = header.indexOf(n); const v = (row[i] ?? "").trim().replace(/^'/, ""); if (i >= 0 && v) return v; } return ""; };
  const shopify = header.includes("Email") && (header.includes("First Name") || header.includes("Last Name"));
  if (!shopify && !header.includes("E-mail")) return { error: "Colonne « E-mail » introuvable. Utilisez un export clients Shopify ou partez de notre export." };
  const rows = table.slice(1).map((r, i) => {
    const country = shopify ? at(r, "Default Address Country Code", "Country Code", "Country") : at(r, "Pays");
    return {
      line: i + 2,
      name: (shopify ? `${at(r, "First Name")} ${at(r, "Last Name")}` : at(r, "Nom")).trim().slice(0, 80),
      email: (shopify ? at(r, "Email") : at(r, "E-mail")).toLowerCase().slice(0, 160),
      marketing: yes(shopify ? at(r, "Accepts Email Marketing", "Accepts Marketing") : at(r, "Abonné newsletter")),
      tags: (shopify ? at(r, "Tags") : at(r, "Étiquettes")).slice(0, 300),
      note: (shopify ? at(r, "Note") : at(r, "Note")).slice(0, 2000),
      phone: (shopify ? at(r, "Phone", "Default Address Phone") : at(r, "Téléphone")).slice(0, 30),
      line1: (shopify ? [at(r, "Default Address Address1", "Address1"), at(r, "Default Address Address2", "Address2")].filter(Boolean).join(", ") : at(r, "Adresse")).slice(0, 140),
      zip: (shopify ? at(r, "Default Address Zip", "Zip") : at(r, "Code postal")).slice(0, 12),
      city: (shopify ? at(r, "Default Address City", "City") : at(r, "Ville")).slice(0, 60),
      country: (COUNTRY[country.toUpperCase()] ?? country).slice(0, 60),
    };
  });
  return { rows, shopify };
}

/**
 * Crée ou met à jour les clients (par e-mail). L'abonnement newsletter n'est accordé que si la personne
 * l'avait accepté (consentement repris tel quel) ; un client déjà désabonné ici n'est jamais réabonné.
 */
export async function importCustomers(storeId: string, rows: (Row & { line: number })[]) {
  let created = 0, updated = 0, subscribed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    if (!z.string().email().safeParse(r.email).success) { errors.push(`Ligne ${r.line} : e-mail invalide « ${r.email} ».`); continue; }
    const existing = await db.customer.findUnique({ where: { storeId_email: { storeId, email: r.email } } });
    const address = r.line1 || r.city ? JSON.stringify({ line1: r.line1, zip: r.zip, city: r.city, country: r.country || "France" }) : undefined;
    const tags = splitTags([existing?.tags ?? "", r.tags].join(",")).slice(0, 20).join(", ");
    const marketing = r.marketing && !(existing && existing.marketingToken && !existing.acceptsMarketing); // désabonné ici : on respecte son choix
    const data = {
      name: r.name || existing?.name || r.email.split("@")[0],
      tags,
      // Note ajoutée à la suite de l'existante, sauf si elle y figure déjà (nouvel import du même fichier).
      ...(r.note && !existing?.note.includes(r.note) ? { note: existing?.note ? `${existing.note}\n${r.note}`.slice(0, 2000) : r.note } : {}),
      ...(r.phone ? { phone: r.phone } : {}),
      ...(address ? { address } : {}),
      ...(marketing && !existing?.acceptsMarketing ? { acceptsMarketing: true, marketingToken: existing?.marketingToken ?? randomBytes(18).toString("base64url"), subscribedAt: new Date() } : {}),
    };
    if (marketing && !existing?.acceptsMarketing) subscribed++;
    if (existing) { await db.customer.update({ where: { id: existing.id }, data }); updated++; }
    else { await db.customer.create({ data: { storeId, email: r.email, ...data } }); created++; }
  }
  return { created, updated, subscribed, errors: errors.slice(0, 50) };
}
