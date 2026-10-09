import "server-only";
import { requireStore } from "./auth";
import { db } from "./db";

/** Ajoute une ligne au journal d'activité de la boutique active, au nom de la personne connectée. Ne bloque jamais l'action. */
export async function logActivity(action: string, url?: string) {
  try {
    const { user, store } = await requireStore();
    await db.activityLog.create({ data: { storeId: store.id, userId: user.id, userName: user.name, action: action.slice(0, 300), url } });
  } catch {}
}
