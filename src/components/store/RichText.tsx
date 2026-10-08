import { Fragment } from "react";

/**
 * Mise en forme simple, sans HTML (donc sans risque d'injection) :
 * « ## Titre », « ### Sous-titre », « - élément de liste », **gras**, [texte](https://lien) ; une ligne vide sépare les paragraphes.
 */
function inline(text: string, key: string) {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}b${i++}`}>{m[1]}</strong>);
    else {
      const href = m[3];
      const safe = /^(https?:\/\/|\/|mailto:)/.test(href);
      out.push(safe ? <a key={`${key}a${i++}`} href={href} className="underline underline-offset-4" {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{m[2]}</a> : m[2]);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let para: string[] = [], list: string[] = [];
  const flush = () => {
    if (para.length) { const k = `p${blocks.length}`; blocks.push(<p key={k}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, `${k}-${i}`)}</Fragment>)}</p>); para = []; }
    if (list.length) { const k = `l${blocks.length}`; blocks.push(<ul key={k} className="list-disc pl-6">{list.map((l, i) => <li key={i}>{inline(l, `${k}-${i}`)}</li>)}</ul>); list = []; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith("### ")) { flush(); blocks.push(<h3 key={`h${blocks.length}`} className="pt-2 text-lg font-semibold">{inline(line.slice(4), `h${blocks.length}`)}</h3>); continue; }
    if (line.startsWith("## ")) { flush(); blocks.push(<h2 key={`h${blocks.length}`} className="pt-4 font-[family-name:var(--t-display)] text-2xl font-semibold">{inline(line.slice(3), `h${blocks.length}`)}</h2>); continue; }
    if (/^[-*] /.test(line)) { if (para.length) { const l = list; list = []; flush(); list = l; } list.push(line.slice(2)); continue; }
    if (list.length) flush();
    para.push(line);
  }
  flush();
  return <div className={`flex flex-col gap-4 leading-relaxed ${className}`}>{blocks}</div>;
}
