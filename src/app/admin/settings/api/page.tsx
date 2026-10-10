import { deleteApiKey, deleteWebhook, testWebhook } from "./actions";
import { ApiKeyForm, WebhookForm } from "@/components/admin/ApiForms";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { CopyField } from "@/components/admin/CopyField";
import { PageHeader, Pill } from "@/components/ui";
import { API_RATE_PER_MINUTE, SCOPES } from "@/lib/api";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";
import { formatDateTime, parseJson } from "@/lib/utils";
import { MAX_FAILURES, TOPICS } from "@/lib/webhooks";

export const metadata = { title: "API et webhooks" };

const ENDPOINTS: [string, string, string, string][] = [
  ["GET", "/api/v1/shop", "read_products", "Informations de la boutique"],
  ["GET", "/api/v1/products", "read_products", "Produits (?status, ?q, ?limit, ?after)"],
  ["POST", "/api/v1/products", "write_products", "Créer un produit et ses variantes"],
  ["GET", "/api/v1/products/{id ou handle}", "read_products", "Un produit"],
  ["PATCH", "/api/v1/products/{id}", "write_products", "Titre, description, statut, photos"],
  ["PATCH", "/api/v1/variants/{id}", "write_products", "Prix, SKU, poids, stock (stock ou stockAdjustment)"],
  ["GET", "/api/v1/orders", "read_orders", "Commandes (?paymentStatus, ?fulfillmentStatus, ?createdAfter, ?cancelled)"],
  ["GET", "/api/v1/orders/{id ou numéro}", "read_orders", "Une commande"],
  ["POST", "/api/v1/orders/{id}/fulfill", "write_orders", "Marquer expédiée, avec le suivi"],
  ["GET", "/api/v1/customers", "read_customers", "Clients (?email, ?q)"],
  ["GET", "/api/v1/customers/{id}", "read_customers", "Un client"],
];

export default async function ApiPage() {
  const { store } = await requireOwner();
  const [keys, hooks] = await Promise.all([
    db.apiKey.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } }),
    db.webhook.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const base = appUrl();

  return (
    <>
      <PageHeader back="/admin/settings" title="API et webhooks" subtitle="Reliez votre boutique à d'autres logiciels : caisse, ERP, logisticien, comptabilité, automatisations (Zapier, Make)." />
      <div className="flex flex-col gap-4">
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Clés d'API</h2></div>
          {keys.length > 0 && (
            <ul>
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-[550]">{k.name} <code className="text-xs text-muted">{k.prefix}…</code></div>
                    <div className="text-xs text-muted">{parseJson<string[]>(k.scopes, []).join(", ")} · {k.lastUsedAt ? `utilisée le ${formatDateTime(k.lastUsedAt)}` : "jamais utilisée"}</div>
                  </div>
                  <form action={deleteApiKey}><input type="hidden" name="id" value={k.id} /><ConfirmSubmit label="Révoquer" confirmLabel="Révoquer la clé" className="h-8" /></form>
                </li>
              ))}
            </ul>
          )}
          <ApiKeyForm scopes={SCOPES} />
        </section>

        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Webhooks</h2></div>
          {hooks.length > 0 && (
            <ul>
              {hooks.map((h) => (
                <li key={h.id} className="flex flex-col gap-2 border-b border-line px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{h.url}</span>
                    {h.failures >= MAX_FAILURES ? <Pill tone="bad">Désactivé</Pill> : h.lastStatus === null ? <Pill>Jamais appelé</Pill> : h.lastStatus >= 200 && h.lastStatus < 300 ? <Pill tone="ok">OK ({h.lastStatus})</Pill> : <Pill tone="bad">Échec ({h.lastStatus || "pas de réponse"})</Pill>}
                    <form action={testWebhook}><input type="hidden" name="id" value={h.id} /><button className="btn h-8">Envoyer un essai</button></form>
                    <form action={deleteWebhook}><input type="hidden" name="id" value={h.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Supprimer le webhook" className="h-8" /></form>
                  </div>
                  <div className="text-xs text-muted">{parseJson<string[]>(h.topics, []).join(", ")}{h.lastAt ? ` · dernier envoi le ${formatDateTime(h.lastAt)}` : ""}{h.failures > 0 && h.failures < MAX_FAILURES ? ` · ${h.failures} échec(s) d'affilée` : ""}</div>
                  <div className="max-w-xl"><CopyField value={h.secret} label="Clé de signature" /></div>
                </li>
              ))}
            </ul>
          )}
          <WebhookForm topics={TOPICS} />
        </section>

        <section className="card flex flex-col gap-3 p-4 text-[13px]">
          <h2 className="text-sm font-[650]">Documentation</h2>
          <p>Chaque requête porte la clé dans l'en-tête <code>Authorization: Bearer pp_…</code>. Réponses en JSON : <code>{"{ data, next }"}</code> pour une liste, <code>{"{ error: { code, message } }"}</code> en cas d'erreur. Montants en centimes, toutes taxes comprises. Limite : {API_RATE_PER_MINUTE} requêtes par minute et par clé.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead><tr><th className="th">Méthode</th><th className="th">Adresse</th><th className="th">Droit</th><th className="th">Rôle</th></tr></thead>
              <tbody>{ENDPOINTS.map(([m, path, scope, label]) => <tr key={m + path}><td className="td font-mono text-xs">{m}</td><td className="td font-mono text-xs">{path}</td><td className="td font-mono text-xs text-muted">{scope}</td><td className="td">{label}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="font-[650]">Exemple : mettre le stock d'une variante à 12</p>
          <pre className="overflow-x-auto rounded-lg bg-[#1a1a1a] p-3 text-xs text-white">{`curl -X PATCH ${base}/api/v1/variants/ID_DE_LA_VARIANTE \\
  -H "Authorization: Bearer pp_…" \\
  -H "Content-Type: application/json" \\
  -d '{"stock": 12}'`}</pre>
          <p className="font-[650]">Vérifier un webhook</p>
          <p>Chaque envoi est un POST JSON avec les en-têtes <code>X-Parnassa-Topic</code> (l'événement) et <code>X-Parnassa-Hmac-Sha256</code> : la signature HMAC-SHA256, en base64, du corps exact avec la clé de signature. Recalculez-la et refusez l'envoi si elle diffère. Répondez par un code 2xx en moins de 5 secondes ; après {MAX_FAILURES} échecs d'affilée, l'adresse n'est plus appelée (un envoi d'essai la réactive).</p>
          <pre className="overflow-x-auto rounded-lg bg-[#1a1a1a] p-3 text-xs text-white">{`// Node.js
const sig = crypto.createHmac("sha256", process.env.PARNASSA_WEBHOOK_SECRET).update(rawBody).digest("base64");
const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(req.headers["x-parnassa-hmac-sha256"]));`}</pre>
        </section>
      </div>
    </>
  );
}
