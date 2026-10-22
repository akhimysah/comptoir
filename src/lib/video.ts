/** Vidéo YouTube ou Vimeo (seules sources acceptées) : hôte, identifiant et adresse d'intégration, ou null. */
export function parseVideo(url: string): { host: "youtube" | "vimeo"; id: string; embed: string; thumbnail: string | null } | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") id = u.searchParams.get("v") ?? (/^\/(embed|shorts|live)\//.test(u.pathname) ? u.pathname.split("/")[2] : null);
    if (id && /^[\w-]{6,20}$/.test(id)) return { host: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    if (host === "vimeo.com" || host === "player.vimeo.com") { const v = u.pathname.match(/(\d{6,12})/)?.[1]; if (v) return { host: "vimeo", id: v, embed: `https://player.vimeo.com/video/${v}`, thumbnail: null }; }
  } catch {}
  return null;
}
export const embedUrl = (url: string) => parseVideo(url)?.embed ?? null;
