/** Libellé d'un schéma : clé « t:… » traduite, sinon le texte tel quel, sinon le dernier segment humanisé. */
export function schemaLabel(labels: Record<string, string>, s?: string): string {
  if (!s) return "";
  if (!s.startsWith("t:")) return s;
  const key = s.slice(2);
  return labels[key] ?? key.split(".").pop()!.replace(/_/g, " ");
}
