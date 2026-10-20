import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RichText } from "@/components/store/RichText";
import { getStore } from "@/lib/storefront";
import { isPolicyKey, POLICY_LABELS, readPolicies } from "@/lib/checkout-settings";

/** Politique publiée de la boutique (texte du marchand, en français ; habillage dans la langue du visiteur). */
async function load(slug: string, key: string) {
  const { store, locale } = await getStore(slug);
  if (!isPolicyKey(key)) notFound();
  const policy = readPolicies(store.policies)[key];
  if (!policy.published || !policy.body) notFound();
  return { title: POLICY_LABELS[key][locale], body: policy.body, store };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; key: string }> }): Promise<Metadata> {
  const { slug, key } = await params;
  const { title, body } = await load(slug, key);
  return { title, description: body.replace(/[#*\[\]()]/g, "").slice(0, 160) };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  const { title, body } = await load(slug, key);
  return (
    <article className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="mb-8 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{title}</h1>
      <RichText text={body} className="text-[var(--c-text)]" />
    </article>
  );
}
