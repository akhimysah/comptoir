import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import atlas from "world-atlas/countries-50m.json";
import { COUNTRIES } from "@/lib/countries";

/** Code ISO numérique des pays livrables (clé du fond de carte). */
const ISO: Record<string, string> = {
  France: "250", Belgique: "056", Suisse: "756", Luxembourg: "442", Monaco: "492", Allemagne: "276", Espagne: "724", Italie: "380", Portugal: "620", "Pays-Bas": "528",
  Bulgarie: "100", Chypre: "196", Croatie: "191", Estonie: "233", Finlande: "246", Grèce: "300", Hongrie: "348", Lettonie: "428", Lituanie: "440", Malte: "470", "République tchèque": "203", Roumanie: "642", Slovaquie: "703", Slovénie: "705", "Royaume-Uni": "826", Irlande: "372", Autriche: "040", Suède: "752", Danemark: "208", Pologne: "616", Canada: "124", "États-Unis": "840",
  Maroc: "504", Algérie: "012", Tunisie: "788", Sénégal: "686", "Côte d'Ivoire": "384", Cameroun: "120",
};
/** Territoires trop petits pour le fond de carte : un point à leurs coordonnées. */
const DOTS: Record<string, [number, number]> = { Mayotte: [45.17, -12.83], "La Réunion": [55.53, -21.11], Guadeloupe: [-61.55, 16.25], Martinique: [-61.02, 14.64], Guyane: [-53.1, 3.9], Monaco: [7.42, 43.73], Malte: [14.4, 35.9], Luxembourg: [6.13, 49.61], Chypre: [33.2, 35.1] };

export const MARKET_COLORS = ["#2c6ecb", "#d9534f", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#9333ea", "#ea580c"];

const W = 960, H = 470;
let cache: { byIso: Map<string, string>; others: string; dots: Map<string, [number, number]> } | null = null;
function shapes() {
  if (cache) return cache;
  const topo = atlas as unknown as Topology;
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  const projection = geoNaturalEarth1().fitSize([W, H], { type: "Sphere" } as never);
  const path = geoPath(projection);
  const byIso = new Map<string, string>();
  const others: string[] = [];
  for (const f of fc.features) {
    const d = path(f);
    if (!d) continue;
    if ([...Object.values(ISO)].includes(String(f.id))) byIso.set(String(f.id), d); else others.push(d);
  }
  const dots = new Map<string, [number, number]>();
  for (const [name, ll] of Object.entries(DOTS)) { const p = projection(ll); if (p) dots.set(name, p); }
  return (cache = { byIso, others: others.join(""), dots });
}

/**
 * Carte du monde des marchés (comme la planète de la page Marchés de Shopify) :
 * chaque marché a sa couleur, le reste des pays livrables est dans le marché par défaut, le reste du monde est grisé.
 */
export function WorldMap({ markets, defaultLabel, locale = "fr" }: { markets: { id: string; name: string; countries: string[]; enabled: boolean }[]; defaultLabel: string; locale?: "fr" | "en" }) {
  const { byIso, others, dots } = shapes();
  const colorOf = new Map<string, { color: string; label: string }>();
  markets.forEach((m, i) => { if (m.enabled) for (const c of m.countries) colorOf.set(c, { color: MARKET_COLORS[i % MARKET_COLORS.length], label: m.name }); });
  const DEFAULT = "#8a8a8a";
  const title = (c: string) => `${c} · ${colorOf.get(c)?.label ?? defaultLabel}`;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={locale === "en" ? "World map of markets" : "Carte du monde des marchés"} className="h-auto w-full">
        <path d={others} fill="#e9e9e9" stroke="#fff" strokeWidth={0.5} />
        {COUNTRIES.filter((c) => ISO[c] && byIso.has(ISO[c])).map((c) => (
          <path key={c} d={byIso.get(ISO[c])} fill={colorOf.get(c)?.color ?? DEFAULT} stroke="#fff" strokeWidth={0.6}><title>{title(c)}</title></path>
        ))}
        {[...dots].filter(([c]) => (COUNTRIES as readonly string[]).includes(c)).map(([c, [x, y]]) => (
          <circle key={c} cx={x} cy={y} r={3.5} fill={colorOf.get(c)?.color ?? DEFAULT} stroke="#fff" strokeWidth={1}><title>{title(c)}</title></circle>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DEFAULT }} />{defaultLabel}</span>
        {markets.filter((m) => m.enabled).map((m, i) => <span key={m.id} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MARKET_COLORS[markets.indexOf(m) % MARKET_COLORS.length] }} />{m.name}</span>)}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#e9e9e9]" />{locale === "en" ? "Not shipped" : "Non livré"}</span>
      </figcaption>
    </figure>
  );
}
