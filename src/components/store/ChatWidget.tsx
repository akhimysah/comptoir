"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dict, intlLocale } from "@/lib/i18n";
import { useLocale } from "./locale";

const T = dict(
  {
    network: "Connexion impossible. Réessayez.",
    chatWith: (name: string) => `Discuter avec ${name}`,
    replyNote: "Nous répondons ici et par e-mail",
    close: "Fermer la discussion",
    you: "Vous",
    firstName: "Prénom",
    yourFirstName: "Votre prénom",
    email: "E-mail",
    yourEmail: "Votre e-mail",
    messagePlaceholder: "Votre message…",
    message: "Votre message",
    send: "Envoyer",
    open: "Discuter avec la boutique",
    newReply: "Nouvelle réponse",
  },
  {
    network: "Unable to connect. Please try again.",
    chatWith: (name: string) => `Chat with ${name}`,
    replyNote: "We reply here and by email",
    close: "Close chat",
    you: "You",
    firstName: "First name",
    yourFirstName: "Your first name",
    email: "Email",
    yourEmail: "Your email",
    messagePlaceholder: "Your message…",
    message: "Your message",
    send: "Send",
    open: "Chat with the shop",
    newReply: "New reply",
  },
);

type Msg = { id: string; fromCustomer: boolean; authorName: string; body: string; at: string };

const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_20%,transparent)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-text)]";

/** Bulle de discussion de la boutique. Le jeton de la conversation reste dans le navigateur (et peut revenir par le lien d'un e-mail). */
export function ChatWidget({ slug, storeName, greeting }: { slug: string; storeName: string; greeting: string }) {
  const locale = useLocale();
  const tr = T[locale];
  const key = `comptoir:chat:${slug}`;
  const seenKey = `${key}:seen`;
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unseen, setUnseen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const store = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
  const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

  const load = useCallback(async (t: string, markSeen: boolean) => {
    const r = await fetch(`/s/${slug}/chat?token=${encodeURIComponent(t)}`, { cache: "no-store" }).catch(() => null);
    if (!r) return;
    if (r.status === 404) { store(key, null); setToken(null); setMessages([]); return; }
    const data = (await r.json()) as { messages: Msg[] };
    setMessages(data.messages);
    const lastReply = [...data.messages].reverse().find((m) => !m.fromCustomer);
    if (markSeen && lastReply) store(seenKey, lastReply.at);
    setUnseen(Boolean(lastReply && lastReply.at > (read(seenKey) ?? "")));
  }, [slug, key, seenKey]);

  // Au chargement : conversation reprise depuis le lien d'un e-mail (?chat=…) ou depuis ce navigateur.
  useEffect(() => {
    const fromLink = new URLSearchParams(location.search).get("chat");
    const t = fromLink || read(key);
    if (fromLink) { store(key, fromLink); setOpen(true); }
    if (t) { setToken(t); load(t, Boolean(fromLink)); }
  }, [key, load]);

  // Nouvelles réponses : toutes les 8 s fenêtre ouverte, toutes les minutes sinon.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => load(token, open), open ? 8000 : 60000);
    return () => clearInterval(id);
  }, [token, open, load]);

  useEffect(() => { if (open && token) load(token, true); }, [open, token, load]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.body.trim() || sending) return;
    setSending(true); setError(null);
    const r = await fetch(`/s/${slug}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { token, body: form.body } : form) }).catch(() => null);
    const data = r ? await r.json().catch(() => ({})) : { error: tr.network };
    setSending(false);
    if (data.reset) { store(key, null); setToken(null); setMessages([]); }
    if (data.error) return setError(data.error);
    store(key, data.token);
    setToken(data.token);
    setMessages(data.messages);
    setForm({ ...form, body: "" });
  };

  const time = (iso: string) => new Date(iso).toLocaleString(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section role="dialog" aria-label={tr.chatWith(storeName)} className="flex max-h-[min(560px,calc(100vh-6rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[calc(var(--t-radius)+6px)] border border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] bg-[var(--c-bg)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.35)]">
          <header className="flex items-center justify-between bg-[var(--c-accent)] px-4 py-3 text-[var(--c-accent-text)]">
            <div><div className="font-semibold">{storeName}</div><div className="text-xs opacity-80">{tr.replyNote}</div></div>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr.close} className="rounded p-1 text-lg leading-none hover:opacity-70">✕</button>
          </header>
          <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 text-sm">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[var(--c-surface)] px-3 py-2">{greeting}</div>
            {messages.map((m) => (
              <div key={m.id} className={`flex max-w-[85%] flex-col ${m.fromCustomer ? "self-end items-end" : "items-start"}`}>
                <div className={`whitespace-pre-line break-words rounded-2xl px-3 py-2 ${m.fromCustomer ? "rounded-br-sm bg-[var(--c-accent)] text-[var(--c-accent-text)]" : "rounded-bl-sm bg-[var(--c-surface)]"}`}>{m.body}</div>
                <span className="mt-0.5 text-[11px] text-[var(--c-muted)]">{m.fromCustomer ? tr.you : m.authorName} · {time(m.at)}</span>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] p-3">
            {!token && (
              <div className="grid grid-cols-2 gap-2">
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder={tr.firstName} aria-label={tr.yourFirstName} autoComplete="given-name" className={field} />
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={160} placeholder={tr.email} aria-label={tr.yourEmail} autoComplete="email" className={field} />
              </div>
            )}
            <div className="flex gap-2">
              <textarea required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={2} maxLength={2000} placeholder={tr.messagePlaceholder} aria-label={tr.message} className={`${field} resize-none`} />
              <button disabled={sending} className="self-end rounded-[var(--t-radius)] bg-[var(--c-accent)] px-3 py-2 text-sm font-semibold text-[var(--c-accent-text)] disabled:opacity-50">{sending ? "…" : tr.send}</button>
            </div>
            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? tr.close : tr.open} className="relative grid h-14 w-14 place-items-center rounded-full bg-[var(--c-accent)] text-[var(--c-accent-text)] shadow-[0_10px_30px_-8px_rgba(0,0,0,.45)] transition hover:scale-105">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5.5h16v10H9l-5 4z" /></svg>
        {unseen && !open && <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-[var(--c-accent)] bg-[#e11d48]" aria-label={tr.newReply} />}
      </button>
    </div>
  );
}
