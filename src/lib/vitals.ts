import "server-only";
import { db } from "./db";

/**
 * Core Web Vitals des visiteurs (comme la barre de performance de Shopify) : P75 sur 30 jours,
 * comparé aux 30 jours précédents, avec les seuils de Google (bon / à améliorer / mauvais).
 */
export type VitalName = "lcp" | "inp" | "cls";
export const THRESHOLDS: Record<VitalName, [number, number]> = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };

const p75 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.75))] : null);

export function rating(name: VitalName, value: number | null): "good" | "needs" | "poor" | null {
  if (value === null) return null;
  const [good, poor] = THRESHOLDS[name];
  return value <= good ? "good" : value <= poor ? "needs" : "poor";
}

export async function storeVitals(storeId: string, days = 30) {
  const now = Date.now();
  const since = new Date(now - days * 86400_000);
  const before = new Date(now - 2 * days * 86400_000);
  const rows = await db.webVital.findMany({ where: { storeId, createdAt: { gte: before } }, select: { lcp: true, inp: true, cls: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const current = rows.filter((r) => r.createdAt >= since);
  const previous = rows.filter((r) => r.createdAt < since);
  const metric = (name: VitalName) => {
    const value = p75(current.map((r) => r[name]).filter((v): v is number => v !== null));
    const prev = p75(previous.map((r) => r[name]).filter((v): v is number => v !== null));
    return { value, rating: rating(name, value), delta: value !== null && prev ? Math.round(((value - prev) / prev) * 100) : null };
  };
  // Visites par jour (une mesure = un chargement de page), pour la petite courbe.
  const perDay = Array.from({ length: days }, (_, i) => { const d = new Date(now - (days - 1 - i) * 86400_000).toISOString().slice(0, 10); return current.filter((r) => r.createdAt.toISOString().slice(0, 10) === d).length; });
  return { days, lcp: metric("lcp"), inp: metric("inp"), cls: metric("cls"), visits: current.length, previousVisits: previous.length, perDay };
}
