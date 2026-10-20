import "server-only";
import { db } from "./db";
import type { ViewPage } from "./saved-views";

/** Vues enregistrées d'une liste (lecture côté serveur uniquement : jamais exposée comme action). */
export async function listViews(storeId: string, page: ViewPage) {
  return db.savedView.findMany({ where: { storeId, page }, orderBy: { position: "asc" } });
}
