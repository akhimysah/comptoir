import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { abandonedCartEmail, orderLocale, reviewRequestEmail } from "./emails";
import { translate } from "./i18n";
import { sendMail } from "./mail";
import { priceCart, type CartInput } from "./pricing";
import { appUrl } from "./stripe";
import { parseJson } from "./utils";
import { storeBase } from "./domains";
import { isLocale, type Locale } from "./i18n";
import { localizeItems } from "./locale";

/** Titres des lignes de relance dans la langue du client. */
async function localizeLines<L extends { title: string }>(lines: L[], src: { baseVariantId: string; productTitle: string; variantTitle: string }[], locale: Locale) {
  const t = await localizeItems(src.map((l) => ({ variantId: l.baseVariantId, productTitle: l.productTitle, variantTitle: l.variantTitle })), locale);
  return lines.map((l, i) => ({ ...l, title: t[i].variantTitle === "Par défaut" ? t[i].productTitle : `${t[i].productTitle} (${t[i].variantTitle})` }));
}

/** Envoie la relance d'un panier abandonné. Renvoie false s'il n'y a plus rien à relancer. */
export async function remindCheckout(store: Store, checkoutId: string) {
  const c = await db.checkout.findFirst({ where: { id: checkoutId, storeId: store.id, orderId: null } });
  if (!c) return false;
  const locale = isLocale(c.locale) ? c.locale : "fr";
  const cart = await priceCart(store, parseJson<CartInput>(c.items, []), null, {}, null, { locale });
  if (!cart.lines.length) return false;
  const link = `${storeBase(store)}/cart?recover=${c.token}`;
  const lines = cart.lines.map((l) => ({ title: l.variantTitle === "Par défaut" ? l.productTitle : `${l.productTitle} (${l.variantTitle})`, quantity: l.quantity, priceCents: l.priceCents }));
  await sendMail({ to: c.email, storeId: store.id, ...abandonedCartEmail(store, c.name, await localizeLines(lines, cart.lines, locale), link, locale) });
  await db.checkout.update({ where: { id: c.id }, data: { remindedAt: new Date() } });
  return true;
}

/** Lance les automatisations actives d'une boutique (ou de toutes). Chaque envoi n'a lieu qu'une fois. */
export async function runAutomations(storeId?: string) {
  const stores = await db.store.findMany({ where: { ...(storeId ? { id: storeId } : {}), OR: [{ autoCartReminder: true }, { autoReviewRequest: true }] } });
  let reminders = 0, reviews = 0;
  for (const store of stores) {
    if (store.autoCartReminder) {
      const before = new Date(Date.now() - store.cartReminderHours * 3600_000);
      const due = await db.checkout.findMany({ where: { storeId: store.id, orderId: null, remindedAt: null, activityAt: { lt: before, gt: new Date(Date.now() - 7 * 86400_000) } } });
      for (const c of due) if (await remindCheckout(store, c.id)) reminders++;
    }
    if (store.autoReviewRequest) {
      const before = new Date(Date.now() - store.reviewRequestDays * 86400_000);
      const orders = await db.order.findMany({
        where: { storeId: store.id, fulfillmentStatus: "fulfilled", cancelledAt: null, reviewRequestedAt: null, fulfilledAt: { lt: before, gt: new Date(Date.now() - 60 * 86400_000) }, NOT: { email: { endsWith: ".local" } } },
        include: { items: true },
      });
      for (const o of orders) {
        const handles = await db.product.findMany({ where: { storeId: store.id, title: { in: o.items.filter((i) => !i.isGiftCard).map((i) => i.productTitle) } }, select: { title: true, handle: true, translations: true } });
        await db.order.update({ where: { id: o.id }, data: { reviewRequestedAt: new Date() } });
        if (!handles.length) continue;
        await sendMail({ to: o.email, storeId: store.id, ...reviewRequestEmail(store, o.name, handles.map((h) => ({ title: translate(h, orderLocale(o), ["title"]).title, url: `${storeBase(store)}/p/${h.handle}#avis` })), orderLocale(o)) });
        reviews++;
      }
    }
  }
  // Filet de sécurité : alertes de retour en stock pas encore envoyées (réassort fait ailleurs, import…).
  const { notifyBackInStock } = await import("./stock-alerts");
  const backInStock = await notifyBackInStock(storeId ? { storeId } : {});
  return { reminders, reviews, backInStock };
}
