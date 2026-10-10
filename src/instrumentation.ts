/** Suivi des erreurs serveur : chaque erreur de page, d'action ou d'API est enregistrée (voir lib/errors). */
export async function onRequestError(error: unknown, request: { path: string; method: string }, context: { routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const err = error instanceof Error ? error : new Error(String(error));
  // Les redirections et pages introuvables de Next ne sont pas des erreurs.
  const digest = (err as Error & { digest?: string }).digest ?? "";
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") return;
  const { recordError } = await import("@/lib/errors");
  await recordError({ message: err.message, stack: err.stack, path: request.path, method: request.method, kind: context.routeType });
}
