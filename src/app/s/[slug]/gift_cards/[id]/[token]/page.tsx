import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { giftCardForPage } from "@/lib/gift-card-page";
import { formatMoney } from "@/lib/money";
import { getStore } from "@/lib/storefront";
import { intlLocale } from "@/lib/i18n";

export const metadata = { title: "Carte cadeau" };

/** Page d'une carte cadeau (lien de l'e-mail) : code, solde, QR code, comme la page gift_card de Shopify. */
export default async function GiftCardPage({ params }: { params: Promise<{ slug: string; id: string; token: string }> }) {
  const { slug, id, token } = await params;
  const { store, locale } = await getStore(slug);
  const card = await giftCardForPage(store.id, id, token);
  if (!card) notFound();
  const en = locale === "en";
  const pretty = card.code.match(/.{1,4}/g)?.join(" ") ?? card.code;
  const expired = Boolean(card.expiresAt && card.expiresAt < new Date());
  const qr = await QRCode.toDataURL(`${store.name} ${card.code}`, { margin: 1, width: 180 });
  const money = (c: number) => formatMoney(c, store.currency, intlLocale(locale));
  return (
    <div className="mx-auto max-w-lg px-4 py-14 text-center">
      <p className="text-sm uppercase tracking-wide text-[var(--c-muted)]">{en ? "Gift card" : "Carte cadeau"}</p>
      <h1 className="mt-2 font-[family-name:var(--t-display)] text-4xl font-semibold">{money(card.balanceCents)}</h1>
      {card.balanceCents !== card.initialCents && <p className="mt-1 text-sm text-[var(--c-muted)]">{en ? "Initial value" : "Valeur initiale"} : {money(card.initialCents)}</p>}
      {(card.disabled || expired) && <p className="mt-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-2 text-sm">{expired ? (en ? "This gift card has expired." : "Cette carte cadeau a expiré.") : (en ? "This gift card is disabled." : "Cette carte cadeau est désactivée.")}</p>}
      <div className="mx-auto mt-8 max-w-sm rounded-[var(--t-radius)] border-2 border-dashed border-[color-mix(in_srgb,var(--c-text)_30%,transparent)] p-6">
        <div className="text-xs uppercase tracking-wide text-[var(--c-muted)]">{en ? "Code" : "Code"}</div>
        <div className="mt-2 font-mono text-2xl font-bold tracking-widest">{pretty}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="" className="mx-auto mt-5 h-44 w-44" />
        {card.expiresAt && <div className="mt-3 text-xs text-[var(--c-muted)]">{en ? "Valid until" : "Valable jusqu'au"} {card.expiresAt.toLocaleDateString(intlLocale(locale))}</div>}
      </div>
      <p className="mt-6 text-sm text-[var(--c-muted)]">{en ? "Enter this code in your cart, in the “Gift card” field. Any unused balance stays on the card." : "Saisissez ce code dans votre panier, champ « Carte cadeau ». Le montant non utilisé reste sur la carte."}</p>
      <a href={`/s/${slug}`} className="mt-6 inline-block rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)]">{en ? "Start shopping" : "Découvrir la boutique"}</a>
    </div>
  );
}
