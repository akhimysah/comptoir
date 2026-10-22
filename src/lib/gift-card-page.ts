import "server-only";
import { db } from "./db";
import { giftCardPath, giftCardToken } from "./gift-card-link";

export { giftCardPath, giftCardToken };

/** Carte cadeau d'une boutique si le jeton correspond, sinon null. */
export async function giftCardForPage(storeId: string, cardId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token) || token !== giftCardToken(cardId)) return null;
  return db.giftCard.findFirst({ where: { id: cardId, storeId } });
}

/** Objet gift_card des thèmes Shopify. */
export function shopifyGiftCard(card: { id: string; code: string; initialCents: number; balanceCents: number; disabled: boolean; expiresAt: Date | null }, currency: string, origin: string, root: string) {
  const expired = Boolean(card.expiresAt && card.expiresAt < new Date());
  return {
    id: card.id, code: card.code, balance: card.balanceCents, initial_value: card.initialCents, currency, enabled: !card.disabled && !expired, expired, expires_on: card.expiresAt ? card.expiresAt.toISOString().slice(0, 10) : null,
    pass_url: null, qr_identifier: `${origin}${root}${giftCardPath(card.id)}`, url: `${origin}${root}${giftCardPath(card.id)}`, product: null, template_suffix: "", properties: {}, recipient: null, message: null, last_four_characters: card.code.slice(-4),
  };
}
