/** Convertit la mise en forme simple (## titre, - liste, **gras**, [lien](url)) en HTML d'e-mail, en échappant tout le reste. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function inline(t: string) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2" style="color:#6d28d9">$1</a>');
}

export function markdownToEmailHtml(text: string) {
  const out: string[] = [];
  let para: string[] = [], list: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${para.map(inline).join("<br>")}</p>`);
    if (list.length) out.push(`<ul style="font-size:15px;line-height:1.6;margin:0 0 14px;padding-left:20px">${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
    para = []; list = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith("## ")) { flush(); out.push(`<h2 style="font-size:19px;margin:18px 0 8px">${inline(line.slice(3))}</h2>`); continue; }
    if (/^[-*] /.test(line)) { if (para.length) { const l = list; list = []; flush(); list = l; } list.push(line.slice(2)); continue; }
    if (list.length) flush();
    para.push(line);
  }
  flush();
  return out.join("\n");
}
