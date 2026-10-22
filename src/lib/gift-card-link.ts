import { createHmac } from "crypto";

/** Jeton de la page d'une carte cadeau (lien de l'e-mail) : dérivé du secret du site, jamais le code lui-même. */
export const giftCardToken = (cardId: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "revolution").update(`gift-card:${cardId}`).digest("base64url").slice(0, 24);
export const giftCardPath = (cardId: string) => `/gift_cards/${cardId}/${giftCardToken(cardId)}`;
