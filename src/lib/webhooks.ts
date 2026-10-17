import "server-only";
import { createHmac, randomBytes, randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { after } from "next/server";
import { db } from "./db";
import { orderJson } from "./api";
import { parseJson } from "./utils";

export const TOPICS = {
  "orders/create": "Commande confirmée (payée, ou à échéance pour un client pro)",
  "orders/paid": "Commande payée",
  "orders/fulfilled": "Commande expédiée",
  "orders/cancelled": "Commande annulée",
} as const;
export type Topic = keyof typeof TOPICS;
export const isTopic = (t: string): t is Topic => t in TOPICS;

/** Au-delà de ce nombre d'échecs consécutifs, l'adresse n'est plus appelée (le marchand la réactive en la recréant). */
export const MAX_FAILURES = 50;

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/** Signature d'un envoi : HMAC-SHA256 du corps exact, en base64 (à recalculer côté destinataire). */
export const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64");

/** Adresses privées, locales ou réservées : jamais appelées (protection contre l'accès au réseau interne). */
export function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Vérifie qu'une adresse de webhook est publique (https en production). Renvoie le message d'erreur, ou null. */
export async function checkWebhookUrl(raw: string): Promise<string | null> {
  let url: URL;
  try { url = new URL(raw); } catch { return "Adresse invalide."; }
  const dev = process.env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !(dev && url.protocol === "http:")) return "L'adresse doit commencer par https://.";
  if (url.username || url.password) return "L'adresse ne doit pas contenir d'identifiants.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (dev && (host === "localhost" || host === "127.0.0.1")) return null; // tests en local
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return "Cette adresse n'est pas publique.";
  const addresses = isIP(host) ? [host] : await lookup(host, { all: true }).then((r) => r.map((x) => x.address)).catch(() => []);
  if (!addresses.length) return "Ce nom de domaine est introuvable.";
  if (addresses.some(isPrivateAddress)) return "Cette adresse pointe vers un réseau privé.";
  return null;
}

async function deliver(hook: { id: string; url: string; secret: string }, topic: Topic, payload: unknown) {
  const body = JSON.stringify(payload);
  let status = 0;
  try {
    // Vérifiée à chaque envoi : le nom de domaine a pu changer d'adresse depuis l'enregistrement.
    if (!(await checkWebhookUrl(hook.url))) {
      const res = await fetch(hook.url, {
        method: "POST",
        redirect: "manual", // une redirection pourrait mener vers le réseau interne
        signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json", "User-Agent": "RevolutionEcom-Webhooks/1", "X-Revolution-Topic": topic, "X-Revolution-Webhook-Id": randomUUID(), "X-Revolution-Hmac-Sha256": sign(hook.secret, body) },
        body,
      });
      status = res.status;
    }
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300;
  await db.webhook.update({ where: { id: hook.id }, data: { lastAt: new Date(), lastStatus: status, failures: ok ? 0 : { increment: 1 } } }).catch(() => {});
}

/** Envoie l'événement aux adresses abonnées, après la réponse au client (sans le ralentir). */
export async function emit(storeId: string, topic: Topic, payload: unknown) {
  const hooks = (await db.webhook.findMany({ where: { storeId, failures: { lt: MAX_FAILURES } } })).filter((h) => parseJson<string[]>(h.topics, []).includes(topic));
  if (!hooks.length) return;
  const run = () => Promise.all(hooks.map((h) => deliver(h, topic, payload))).then(() => {});
  try { after(run); } catch { await run(); } // hors requête (tâche planifiée, tests) : envoi immédiat
}

/** Événement de commande : la commande complète, au format de l'API. */
export async function emitOrder(orderId: string, topic: Topic) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { items: true, store: true } });
  if (o) await emit(o.storeId, topic, orderJson(o, o.store));
}
