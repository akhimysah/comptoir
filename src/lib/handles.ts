import "server-only";
import { db } from "./db";
import { slugify } from "./utils";

/** Identifiant d'URL libre pour ce titre dans la boutique (« bol », puis « bol-2 »…). */
export async function uniqueHandle(storeId: string, title: string, exceptId?: string) {
  const base = slugify(title) || "produit";
  let handle = base;
  for (let i = 2; ; i++) {
    const hit = await db.product.findUnique({ where: { storeId_handle: { storeId, handle } } });
    if (!hit || hit.id === exceptId) return handle;
    handle = `${base}-${i}`;
  }
}
