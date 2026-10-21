"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { connectGithubApp, connectGithubToken, listBranches } from "@/app/admin/theme/github-actions";

type Repo = { name: string; defaultBranch: string; private: boolean };
type Props = { github: { app: boolean; appSlug: string | null; account: string | null; repos: Repo[] | null; reposError: string | null } };

/** Menu « Importer » (zip ou GitHub) et ses deux fenêtres, comme sur Shopify. */
export function ThemeImportMenu({ github }: Props) {
  const [open, setOpen] = useState(false);
  const zip = useRef<HTMLDialogElement>(null);
  const gh = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={menu} className="relative">
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Importer <span aria-hidden>▾</span></button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,.3)]">
          <button role="menuitem" type="button" onClick={() => { setOpen(false); zip.current?.showModal(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[#f1f1f1]">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" /></svg>
            Charger un fichier zip
          </button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); gh.current?.showModal(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[#f1f1f1]">
            <GithubIcon /> Se connecter depuis GitHub
          </button>
        </div>
      )}
      <ZipDialog ref={zip} />
      <GithubDialog ref={gh} github={github} />
    </div>
  );
}

export const GithubIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className} aria-hidden><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
);

const dialogClass = "w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line p-0 shadow-[0_24px_64px_-24px_rgba(0,0,0,.45)] backdrop:bg-black/40";

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
      <h2 className="text-[15px] font-[650]">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 text-muted hover:bg-[#f1f1f1]">✕</button>
    </div>
  );
}

export function ZipDialog({ ref, platform = false }: { ref: React.RefObject<HTMLDialogElement | null>; platform?: boolean }) {
  const qs = platform ? "&platform=1" : "";
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [images, setImages] = useState<{ done: number; total: number } | null>(null);

  /**
   * Thème Shopify complet (layout/, sections/, assets/…) : décompressé ici, dans le navigateur, puis envoyé par lots
   * de quelques Mo (limite de l'hébergeur par requête). Un thème Revolution (theme.json) passe par l'import classique.
   */
  const importShopifyTheme = async (file: File) => {
    const { unzipSync } = await import("fflate");
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => !f.name.includes("__MACOSX") && !f.name.endsWith("/") && f.originalSize <= 8 * 1024 * 1024 });
    const paths = Object.keys(entries);
    const isShopify = paths.some((p) => /(^|\/)layout\/theme\.liquid$/.test(p)) && paths.some((p) => /(^|\/)config\/settings_schema\.json$/.test(p));
    if (!isShopify) { if (platform) throw new Error("Ce .zip n'est pas un thème Shopify complet."); return false; }
    const files = paths.filter((p) => /(^|\/)(layout|templates|sections|snippets|config|locales|assets|blocks)\//.test(p));
    const bytes = files.reduce((n, p) => n + entries[p].length, 0);
    const start = await fetch(`/admin/theme/import?step=start${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, files: files.length, bytes }) });
    const { id, error } = (await start.json()) as { id?: string; error?: string };
    if (!id) throw new Error(error ?? "Import impossible.");
    try {
      let batch: string[] = [], size = 0, done = 0;
      setProgress({ done, total: files.length });
      const flush = async () => {
        if (!batch.length) return;
        const fd = new FormData();
        fd.set("id", id);
        for (const p of batch) { fd.append("path", p); fd.append("file", new Blob([entries[p] as BlobPart]), p.split("/").pop()); }
        const res = await fetch(`/admin/theme/import?step=files${qs}`, { method: "POST", body: fd });
        const r = (await res.json()) as { ok?: boolean; error?: string };
        if (!r.ok) throw new Error(r.error ?? "Envoi interrompu.");
        done += batch.length; setProgress({ done, total: files.length });
        batch = []; size = 0;
      };
      for (const p of files) {
        if (size + entries[p].length > 3_000_000 || batch.length >= 150) await flush();
        batch.push(p); size += entries[p].length;
      }
      await flush();
      const fin = await fetch(`/admin/theme/import?step=finish${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const r = (await fin.json()) as { ok?: boolean; url?: string; error?: string; images?: { base: string; names: string[] } | null };
      if (!r.ok || !r.url) throw new Error(r.error ?? "Import impossible.");
      // Photos du marchand référencées par le thème : récupérées par lots depuis le CDN Shopify (progression affichée).
      if (r.images) {
        const { base, names } = r.images;
        let got = 0;
        setImages({ done: 0, total: names.length });
        for (let i = 0; i < names.length; i += 6) {
          const res = await fetch("/admin/theme/import?step=images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, base, names: names.slice(i, i + 6) }) }).then((x) => x.json() as Promise<{ done?: number }>).catch(() => ({ done: 0 }));
          got += res.done ?? 0;
          setImages({ done: Math.min(names.length, i + 6), total: names.length });
        }
        void got;
      }
      window.location.href = r.url;
    } catch (e) {
      await fetch(`/admin/theme/import?id=${id}${qs}`, { method: "DELETE" }).catch(() => {});
      throw e;
    }
    return true;
  };

  const pick = async (file: File | undefined) => {
    setProblem(null);
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return setProblem("Déposez un fichier .zip.");
    if (file.size > 80 * 1024 * 1024) return setProblem("Fichier trop lourd (80 Mo maximum).");
    setName(file.name);
    try {
      if (await importShopifyTheme(file)) return;
    } catch (e) {
      setName(null); setProgress(null);
      return setProblem((e as Error).message || "Import impossible.");
    }
    // Thème Revolution Ecom (theme.json) : import classique.
    if (file.size > 2 * 1024 * 1024) { setName(null); return setProblem("Ce .zip n'est ni un thème Shopify, ni un thème Revolution Ecom de moins de 2 Mo."); }
    if (input.current && input.current.files?.[0] !== file) { const dt = new DataTransfer(); dt.items.add(file); input.current.files = dt.files; }
    form.current?.requestSubmit();
  };
  return (
    <dialog ref={ref} className={dialogClass}>
      <DialogHeader title="Charger un fichier zip" onClose={() => ref.current?.close()} />
      <form ref={form} action="/admin/theme/zip" method="post" encType="multipart/form-data" className="flex flex-col gap-3 p-5">
        <p className="text-[13px] text-muted">{platform ? "Thème Shopify (.zip) ajouté à la bibliothèque de la plateforme : chaque boutique pourra l'installer depuis « Découvrir des thèmes »." : "Thème Shopify (.zip exporté depuis Shopify ou acheté sur le Theme Store) ou thème Revolution Ecom. Il est ajouté à vos brouillons : vous pourrez le prévisualiser avant de le publier."}</p>
        {problem && <p role="alert" className="rounded-lg bg-[#fff4f4] px-3 py-2 text-[13px] text-[#8e0b21]">{problem}</p>}
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${over ? "border-[#7c3aed] bg-[#f5f3ff]" : "border-line hover:bg-[#f7f7f7]"}`}
        >
          <span className="text-[13px] font-[550]">{name ? `Import de ${name}…` : "Déposez un thème .zip ici, ou cliquez pour le choisir"}</span>
          {progress ? (
            <span className="mt-1 flex w-full max-w-xs flex-col gap-1 text-xs text-muted"><span className="h-1.5 w-full overflow-hidden rounded-full bg-[#e3e3e3]"><span className="block h-full bg-[#7c3aed] transition-[width]" style={{ width: `${Math.round(((images ? images.done : progress.done) / Math.max(1, images ? images.total : progress.total)) * 100)}%` }} /></span>{images ? `Récupération de vos photos depuis Shopify : ${images.done} / ${images.total}` : `${progress.done} / ${progress.total} fichiers envoyés`}</span>
          ) : (
            <span className="text-xs text-muted">Thème Shopify complet (layout, sections, assets…) jusqu'à 60 Mo, ou theme.json</span>
          )}
          <input ref={input} type="file" name="zip" accept=".zip,application/zip" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-muted">Les thèmes Shopify sont rendus par notre moteur Liquid : la grande majorité des sections fonctionne, certaines fonctions propres à Shopify (applications, Shop Pay) n'existent pas ici.</p>
      </form>
    </dialog>
  );
}

/** Fenêtre « Connecter le thème » : compte GitHub, dépôt (avec recherche) et branche. */
function GithubDialog({ ref, github }: { ref: React.RefObject<HTMLDialogElement | null>; github: Props["github"] }) {
  const [repo, setRepo] = useState<string>("");
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [token, setToken] = useState(false);
  const repos = github.repos ?? [];
  const shown = repos.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const choose = (r: Repo) => {
    setRepo(r.name); setListOpen(false); setBranch(r.defaultBranch); setBranches(null); setError(null);
    start(async () => { const res = await listBranches(r.name); if (res.error) setError(res.error); else setBranches(res.branches ?? []); });
  };
  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} className={dialogClass}>
      <DialogHeader title="Connecter le thème" onClose={close} />
      {!github.app || token ? (
        <form action={connectGithubToken} className="flex flex-col gap-3 p-5">
          {!github.app && <p className="rounded-lg bg-[#f1f1f1] px-3 py-2 text-xs text-muted">La connexion en un clic apparaît dès que l'administrateur de la plateforme a créé l'application GitHub. En attendant, reliez le dépôt avec un jeton.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="label sm:col-span-2">Dépôt<input name="repo" required placeholder="propriétaire/dépôt" className="input font-mono" /></label>
            <label className="label">Branche<input name="branch" defaultValue="main" className="input font-mono" /></label>
          </div>
          <label className="label">Dossier du thème <span className="hint">Facultatif</span><input name="path" className="input font-mono" /></label>
          <label className="label">Jeton d'accès GitHub <span className="hint">Fine-grained token limité à ce dépôt, « Contents : Read and write ». Chiffré, jamais réaffiché.</span><input name="token" type="password" required autoComplete="off" placeholder="github_pat_…" className="input font-mono" /></label>
          <div className="flex items-center justify-between gap-2">
            {github.app ? <button type="button" onClick={() => setToken(false)} className="text-xs text-muted hover:underline">← Utiliser mon compte GitHub</button> : <span />}
            <button className="btn btn-primary">Connecter</button>
          </div>
        </form>
      ) : !github.account ? (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-[13px] text-muted">Autorisez l'application GitHub de la plateforme sur votre compte, puis choisissez le dépôt du thème. Comme sur Shopify : chaque commit sur la branche met le thème à jour.</p>
          <a href="/api/github/install" className="btn btn-primary self-start"><GithubIcon /> Se connecter à GitHub</a>
          <button type="button" onClick={() => setToken(true)} className="self-start text-xs text-muted hover:underline">Utiliser plutôt un jeton d'accès</button>
        </div>
      ) : (
        <form action={connectGithubApp} className="flex flex-col gap-4 p-5">
          <label className="label">Compte
            <select className="input" defaultValue={github.account}><option>{github.account}</option></select>
          </label>
          <div className="label">Référentiel
            <input type="hidden" name="repo" value={repo} />
            <button type="button" onClick={() => setListOpen((o) => !o)} className="input flex items-center justify-between text-left" aria-haspopup="listbox" aria-expanded={listOpen}>
              <span className={repo ? "font-mono" : "text-muted"}>{repo || "Sélectionner"}</span><span aria-hidden>⌃⌄</span>
            </button>
            {listOpen && (
              <div className="mt-1 rounded-xl border border-line bg-white shadow-[0_12px_32px_-12px_rgba(0,0,0,.3)]">
                <div className="p-2"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher un dépôt" className="input h-9" /></div>
                <ul role="listbox" className="max-h-56 overflow-y-auto px-1 pb-1">
                  {github.reposError && <li className="px-3 py-2 text-[13px] text-[#8e0b21]">{github.reposError}</li>}
                  {shown.map((r) => (
                    <li key={r.name} role="option" aria-selected={repo === r.name}>
                      <button type="button" onClick={() => choose(r)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-[#f1f1f1]">
                        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted" fill="currentColor" aria-hidden><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.25.25 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" /></svg>
                        <span className="min-w-0"><span className="block truncate text-[13px] font-[550]">{r.name.split("/")[1]}</span><span className="block truncate text-xs text-muted">{r.name.split("/")[0]}{r.private ? " · privé" : ""}</span></span>
                      </button>
                    </li>
                  ))}
                  {!shown.length && !github.reposError && <li className="px-3 py-2 text-[13px] text-muted">Aucun dépôt{q ? ` pour « ${q} »` : ""}.</li>}
                </ul>
                <div className="border-t border-line px-3 py-2 text-xs text-muted">Vous ne pouvez pas accéder à un référentiel ? <a href={`https://github.com/apps/${github.appSlug}/installations/new`} className="text-pine hover:underline">Vérifier les autorisations de l'application GitHub</a></div>
              </div>
            )}
          </div>
          {repo && (
            <label className="label">Branche
              {branches ? (
                <select name="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="input font-mono">{branches.map((b) => <option key={b} value={b}>{b}</option>)}</select>
              ) : (
                <input name="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="input font-mono" placeholder={pending ? "Chargement des branches…" : "main"} />
              )}
            </label>
          )}
          {repo && <label className="label">Dossier du thème <span className="hint">Facultatif, ex. themes/argile</span><input name="path" className="input font-mono" /></label>}
          {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="flex items-center gap-2 text-xs text-muted"><GithubIcon /> Compte GitHub <b className="font-[550] text-ink">{github.account}</b></span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setToken(true)} className="text-xs text-muted hover:underline">Jeton</button>
              <button className="btn btn-primary" disabled={!repo}>Connecter</button>
            </span>
          </div>
        </form>
      )}
    </dialog>
  );
}
