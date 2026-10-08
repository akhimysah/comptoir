import "server-only";
import { db } from "./db";

/**
 * Envoie un e-mail via Resend si RESEND_API_KEY est défini, sinon l'enregistre seulement.
 * Ne lève jamais d'erreur : un e-mail raté ne doit pas faire échouer une commande.
 */
export async function sendMail({ to, subject, html, storeId }: { to: string; subject: string; html: string; storeId?: string }) {
  const key = process.env.RESEND_API_KEY;
  let status = "logged";
  let error: string | null = null;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.MAIL_FROM || "Comptoir <onboarding@resend.dev>", to, subject, html }),
      });
      status = res.ok ? "sent" : "failed";
      if (!res.ok) error = (await res.text()).slice(0, 500);
    } catch (e) {
      status = "failed";
      error = String(e).slice(0, 500);
    }
  } else {
    console.log(`[e-mail non envoyé, pas de RESEND_API_KEY] À : ${to} — ${subject}`);
  }
  try {
    await db.mailLog.create({ data: { storeId, to, subject, html, status, error } });
  } catch {}
}
