"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "MAD"] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Le nom doit faire au moins 2 caractères.").max(60),
  tagline: z.string().trim().max(200),
  currency: z.enum(CURRENCIES),
  shipping: z.string(),
  freeFrom: z.string(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).optional().default(3),
});

export async function saveSettings(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  const shippingCents = parseMoney(s.shipping);
  const freeShippingFromCents = parseMoney(s.freeFrom || "0");
  if (shippingCents === null) return { error: "Indiquez des frais de livraison valides (0 pour gratuit)." };
  if (freeShippingFromCents === null) return { error: "Le seuil de livraison offerte n'est pas valide." };
  await db.store.update({ where: { id: store.id }, data: { name: s.name, tagline: s.tagline, currency: s.currency, shippingCents, freeShippingFromCents, lowStockThreshold: s.lowStockThreshold } });
  await logActivity("Paramètres de la boutique modifiés", "/admin/settings");
  revalidatePath("/admin", "layout");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ok: true };
}

export async function saveTaxes(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const bps = Number(form.get("taxRateBps"));
  if (![2000, 1000, 550, 210, 0].includes(bps)) return { error: "Taux de TVA invalide." };
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  await db.store.update({
    where: { id: store.id },
    data: { taxRateBps: bps, legalName: str("legalName", 120), legalAddress: str("legalAddress", 300), siret: str("siret", 20), vatNumber: str("vatNumber", 20) },
  });
  await logActivity("Taxes et mentions légales modifiées", "/admin/settings");
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Devises d'affichage de la boutique : cases cochées et taux saisis (1 unité de la devise de la boutique = taux). */
export async function saveCurrencies(_: { error?: string; ok?: string } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const codes = form.getAll("code").map(String).filter((c) => /^[A-Z]{3}$/.test(c) && c !== store.currency);
  let list = codes.map((code) => ({ code, rate: Number(String(form.get(`rate_${code}`) ?? "").replace(",", ".")) }));
  let note = "";
  if (form.get("auto") === "1" && codes.length) {
    // Taux du jour de la Banque centrale européenne (via frankfurter.app) ; les devises non couvertes gardent le taux saisi.
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${store.currency}&to=${codes.join(",")}`, { cache: "no-store" });
      const json = res.ok ? ((await res.json()) as { rates?: Record<string, number> }) : {};
      const rates = json.rates ?? {};
      list = list.map((c) => (rates[c.code] ? { ...c, rate: rates[c.code] } : c));
      const missing = codes.filter((c) => !rates[c]);
      note = missing.length ? `Taux mis à jour, sauf ${missing.join(", ")} (non publiés par la BCE : saisissez-les à la main).` : "Taux du jour appliqués.";
    } catch {
      return { error: "Impossible de récupérer les taux du jour. Saisissez-les à la main." };
    }
  }
  const bad = list.find((c) => !(c.rate > 0));
  if (bad) return { error: `Indiquez un taux pour ${bad.code}.` };
  await db.store.update({ where: { id: store.id }, data: { displayCurrencies: JSON.stringify(list.map((c) => ({ code: c.code, rate: Math.round(c.rate * 10000) / 10000 }))) } });
  await logActivity(`Devises affichées : ${list.map((c) => c.code).join(", ") || "aucune"}`, "/admin/settings");
  revalidatePath("/admin/settings");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ok: note || "Enregistré." };
}

export async function saveLoyalty(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const n = (k: string) => Math.floor(Number(String(form.get(k) ?? "").replace(",", ".")));
  const enabled = form.get("enabled") === "on";
  const perUnit = n("perUnit"), rewardPoints = n("rewardPoints");
  const rewardCents = parseMoney(String(form.get("rewardValue") ?? ""));
  if (!(perUnit >= 1 && perUnit <= 100)) return { error: "Points par unité : entre 1 et 100." };
  if (!(rewardPoints >= 1)) return { error: "Indiquez le nombre de points d'un bon." };
  if (!rewardCents || rewardCents < 100) return { error: "Indiquez la valeur du bon (1,00 minimum)." };
  await db.store.update({ where: { id: store.id }, data: { loyaltyEnabled: enabled, loyaltyPointsPerUnit: perUnit, loyaltyRewardPoints: rewardPoints, loyaltyRewardCents: rewardCents } });
  await logActivity(`Programme de fidélité ${enabled ? "activé" : "désactivé"}`, "/admin/settings");
  revalidatePath("/admin/settings");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ok: true };
}

export async function saveReturns(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const enabled = form.get("enabled") === "on";
  const days = Math.floor(Number(form.get("days") ?? 0));
  if (!(days >= 1 && days <= 365)) return { error: "Délai de retour : entre 1 et 365 jours." };
  const instructions = String(form.get("instructions") ?? "").trim().slice(0, 2000);
  await db.store.update({ where: { id: store.id }, data: { returnsEnabled: enabled, returnWindowDays: days, returnInstructions: instructions } });
  await logActivity(`Retours en ligne ${enabled ? `activés (${days} jours)` : "désactivés"}`, "/admin/settings");
  revalidatePath("/admin/settings");
  return { ok: true };
}
