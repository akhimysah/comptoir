/** CSV au format Excel français : séparateur « ; », guillemets si besoin, BOM UTF-8 pour les accents. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Un texte qui commence par = + - @ serait exécuté comme formule par Excel : on le neutralise.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

/** Lit un CSV (séparateur « ; » ou « , » détecté sur la première ligne). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const PRODUCT_COLUMNS = [
  "Identifiant", "Titre", "Description", "Statut", "Collections",
  "Option1 nom", "Option1 valeur", "Option2 nom", "Option2 valeur", "Option3 nom", "Option3 valeur",
  "Prix", "Prix avant réduction", "SKU", "Stock",
] as const;

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
