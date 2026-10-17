import "server-only";
import { createHash } from "crypto";
import { db } from "./db";
import { sendMail } from "./mail";
import { appUrl } from "./stripe";

/** Administrateurs de la plateforme (variable PLATFORM_ADMINS : e-mails séparés par des virgules). */
export const platformAdmins = () => (process.env.PLATFORM_ADMINS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isPlatformAdmin = (email: string) => platformAdmins().includes(email.toLowerCase());

/** Chemin sans identifiants ni paramètres : /admin/orders/ckx… → /admin/orders/:id (pour regrouper les erreurs). */
export const normalizeErrorPath = (p: string) => p.split("?")[0].replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, "/:id").slice(0, 300);

/** Enregistre une erreur serveur (sans jamais en provoquer une autre) et prévient l'administrateur au plus une fois par heure et par erreur. */
export async function recordError(e: { message: string; stack?: string; path: string; method?: string; kind?: string }) {
  try {
    const path = normalizeErrorPath(e.path);
    const message = (e.message || "Erreur inconnue").slice(0, 500);
    const signature = createHash("sha1").update(`${message}|${path}`).digest("hex");
    const row = await db.errorLog.upsert({
      where: { signature },
      update: { count: { increment: 1 }, lastAt: new Date(), resolved: false },
      create: { signature, message, path, method: e.method ?? "", kind: e.kind ?? "", stack: (e.stack ?? "").slice(0, 4000) },
    });
    const admins = platformAdmins();
    const hourAgo = new Date(Date.now() - 3600_000);
    if (!admins.length) return;
    const claimed = await db.errorLog.updateMany({ where: { id: row.id, OR: [{ notifiedAt: null }, { notifiedAt: { lt: hourAgo } }] }, data: { notifiedAt: new Date() } });
    if (!claimed.count) return;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    for (const to of admins) {
      await sendMail({
        to,
        subject: `[Revolution Ecom] Erreur sur ${path}`,
        html: `<p style="font-family:sans-serif;font-size:14px">Une erreur s'est produite sur <b>${esc(path)}</b> (${row.count} fois).</p><pre style="font-size:12px;background:#f7f7f7;padding:12px;white-space:pre-wrap">${esc(message)}</pre><p><a href="${appUrl()}/admin/platform/errors">Voir les erreurs</a></p>`,
      });
    }
  } catch {
    // Le suivi des erreurs ne doit jamais faire planter le site.
  }
}
