"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import { storeCurrencies } from "@/lib/currency";
import { db } from "@/lib/db";
import { isLocale } from "@/lib/i18n";

const back = (kind: "ok" | "err", msg: string) => redirect(`/admin/settings/markets?${kind}=${encodeURIComponent(msg)}`);
const done = (slug: string) => { revalidatePath("/admin/settings/markets"); revalidatePath(`/s/${slug}`, "layout"); };

export async function saveMarket(form: FormData) {
  const { store } = await requireOwner();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const countries = form.getAll("countries").map(String).filter((c) => (COUNTRIES as readonly string[]).includes(c));
  const currency = String(form.get("currency") ?? "");
  const locale = String(form.get("locale") ?? "");
  const pct = Number(String(form.get("adjust") ?? "0").replace(",", "."));
  if (!name) back("err", "Donnez un nom au marché (ex. « Europe »).");
  if (!countries.length) back("err", "Choisissez au moins un pays.");
  if (currency && !storeCurrencies(store).some((c) => c.code === currency)) back("err", "Cette devise n'est pas affichée par la boutique (Paramètres → Devises).");
  if (locale && !isLocale(locale)) back("err", "Langue inconnue.");
  if (!Number.isFinite(pct) || pct < -90 || pct > 300) back("err", "L'ajustement de prix doit être compris entre −90 % et +300 %.");
  // Un pays n'appartient qu'à un seul marché.
  const others = await db.market.findMany({ where: { storeId: store.id, NOT: { id } } });
  const taken = countries.find((c) => others.some((m) => (JSON.parse(m.countries) as string[]).includes(c)));
  if (taken) back("err", `${taken} fait déjà partie d'un autre marché.`);
  const data = { name, countries: JSON.stringify(countries), currency, locale, priceAdjustBps: Math.round(pct * 100), enabled: form.get("enabled") !== "off" };
  if (id) {
    const r = await db.market.updateMany({ where: { id, storeId: store.id }, data });
    if (!r.count) back("err", "Marché introuvable.");
  } else {
    if ((await db.market.count({ where: { storeId: store.id } })) >= 20) back("err", "20 marchés au maximum.");
    await db.market.create({ data: { storeId: store.id, ...data, position: Date.now() % 1_000_000 } });
  }
  await logActivity(`Marché « ${name} » enregistré`, "/admin/settings/markets");
  done(store.slug);
  back("ok", `Marché « ${name} » enregistré.`);
}

export async function toggleMarket(form: FormData) {
  const { store } = await requireOwner();
  const m = await db.market.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!m) return;
  await db.market.update({ where: { id: m.id }, data: { enabled: !m.enabled } });
  done(store.slug);
}

export async function deleteMarket(form: FormData) {
  const { store } = await requireOwner();
  const m = await db.market.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!m) return;
  await db.market.delete({ where: { id: m.id } });
  await logActivity(`Marché « ${m.name} » supprimé`, "/admin/settings/markets");
  done(store.slug);
  back("ok", `Marché « ${m.name} » supprimé.`);
}
