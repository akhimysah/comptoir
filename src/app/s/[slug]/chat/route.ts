import { NextResponse } from "next/server";
import { z } from "zod";
import { conversationByToken, postCustomerMessage, startConversation, thread } from "@/lib/chat";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";
import { dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const MSG = dict(
  {
    notFound: "Conversation introuvable.",
    body: "Écrivez votre message.",
    tooLong: "Message trop long (2 000 caractères maximum).",
    off: "La messagerie n'est pas disponible.",
    tooMany: "Trop de messages. Réessayez dans un moment.",
    name: "Indiquez votre prénom.",
    email: "Indiquez une adresse e-mail valide pour recevoir notre réponse.",
    tooManyChats: "Trop de conversations ouvertes. Réessayez plus tard.",
  },
  {
    notFound: "Conversation not found.",
    body: "Write your message.",
    tooLong: "Message too long (2,000 characters maximum).",
    off: "Chat isn't available.",
    tooMany: "Too many messages. Try again in a moment.",
    name: "Enter your first name.",
    email: "Enter a valid email address so we can reply.",
    tooManyChats: "Too many open conversations. Try again later.",
  },
);

async function storeOf(slug: string) {
  return db.store.findUnique({ where: { slug }, select: { id: true, chatEnabled: true, languages: true } });
}

/** Fil de la conversation du visiteur (jeton gardé par son navigateur). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const store = await storeOf((await params).slug);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const c = store && token ? await conversationByToken(store.id, token) : null;
  if (!c) return NextResponse.json({ error: MSG[store ? await getLocale(store) : "fr"].notFound }, { status: 404 });
  return NextResponse.json({ name: c.name, messages: await thread(c.id) }, { headers: { "Cache-Control": "no-store" } });
}

const schemaFor = (t: (typeof MSG)[Locale]) => z.object({
  token: z.string().max(64).optional(),
  name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  body: z.string().trim().min(1, t.body).max(2000, t.tooLong),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const store = await storeOf((await params).slug);
  const t = MSG[store ? await getLocale(store) : "fr"];
  if (!store?.chatEnabled) return NextResponse.json({ error: t.off }, { status: 404 });
  const parsed = schemaFor(t).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;
  if (!(await hit(`chat:${await clientIp()}`, 40, 3600_000))) return NextResponse.json({ error: t.tooMany }, { status: 429 });

  if (b.token) {
    const c = await conversationByToken(store.id, b.token);
    if (!c) return NextResponse.json({ error: t.notFound, reset: true }, { status: 404 });
    await postCustomerMessage(c.id, c.name, b.body);
    return NextResponse.json({ token: b.token, messages: await thread(c.id) });
  }
  if (b.name.length < 1) return NextResponse.json({ error: t.name }, { status: 400 });
  if (!z.string().email().safeParse(b.email).success) return NextResponse.json({ error: t.email }, { status: 400 });
  if (!(await hit(`chat-new:${await clientIp()}`, 5, 3600_000))) return NextResponse.json({ error: t.tooManyChats }, { status: 429 });
  const token = await startConversation(store.id, b.name, b.email, b.body);
  const c = await conversationByToken(store.id, token);
  return NextResponse.json({ token, messages: await thread(c!.id) });
}
