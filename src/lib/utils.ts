export function slugify(input: string) {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
export const formatDateTime = (d: Date) =>
  d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Chemin de redirection sûr : uniquement une page de ce site (jamais « //autre-site » ni « /\autre-site »). */
export function safeNext(next: string, fallback: string) {
  if (!/^\/[^/\\\t\r\n]/.test(next) && next !== "/") return fallback;
  try {
    const u = new URL(next, "http://x");
    return u.origin === "http://x" ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
