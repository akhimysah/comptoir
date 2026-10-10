import "server-only";
import { isEuVatNumber, normalizeVatNumber } from "./tax";

export type ViesResult = { valid: boolean; name: string; address: string } | { error: string };

/**
 * Vérifie un numéro de TVA intracommunautaire auprès de VIES (service de la Commission européenne).
 * VIES est parfois indisponible : l'erreur est alors renvoyée, sans conclure que le numéro est invalide.
 */
export async function checkVies(vatNumber: string): Promise<ViesResult> {
  const n = normalizeVatNumber(vatNumber);
  if (!isEuVatNumber(n)) return { valid: false, name: "", address: "" };
  try {
    const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${n.slice(0, 2)}/vat/${encodeURIComponent(n.slice(2))}`, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
    if (!res.ok) return { error: `VIES ne répond pas (code ${res.status}).` };
    const data = (await res.json()) as { isValid?: boolean; userError?: string; name?: string; address?: string };
    if (typeof data.isValid !== "boolean" || (!data.isValid && data.userError && data.userError !== "INVALID")) return { error: `VIES est indisponible pour ce pays (${data.userError ?? "réponse inattendue"}).` };
    const clean = (s?: string) => (s && s !== "---" ? s.trim() : "");
    return { valid: data.isValid, name: clean(data.name), address: clean(data.address) };
  } catch {
    return { error: "VIES ne répond pas. Réessayez plus tard." };
  }
}
