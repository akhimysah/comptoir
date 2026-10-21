/**
 * État d'un rendu de page, partagé entre le moteur, les tags et les filtres via une propriété
 * non énumérable des « globals » liquidjs (invisible pour les gabarits, transmise aux snippets).
 */
import type { Context, Liquid, Template } from "liquidjs";
import { FontCollector } from "./fonts";
import type { Resolver, SchemeDrop, SectionSchema } from "./schema";
import type { Dict } from "./translations";
import type { PageData, ThemeSource } from "./types";

export const RS: unique symbol = Symbol("renderState");

/** Fichier Liquid analysé (gabarit + blocs extraits). */
export type Loaded = { templates: Template[]; schema: SectionSchema | null; schemaText: string | null; stylesheets: string[]; javascripts: string[] };

/** Ce que le moteur expose aux tags : chargement de fichiers et rendu de sections. */
export type EngineApi = {
  liquid: Liquid;
  load(path: string): Promise<Loaded | null>;
  /** Rend une section (statique `{% section %}` ou membre d'un groupe) avec son enveloppe HTML. */
  renderSectionInstance(state: RenderState, instance: SectionInstance, ctx: Context): Promise<string>;
  renderGroup(state: RenderState, name: string, ctx: Context): Promise<string>;
};

export type BlockInstance = { id: string; type: string; settings: Record<string, unknown>; disabled?: boolean; blocks?: Record<string, BlockInstance>; block_order?: string[] };
export type SectionInstance = {
  id: string;
  type: string;
  settings?: Record<string, unknown>;
  blocks?: Record<string, BlockInstance>;
  block_order?: string[];
  disabled?: boolean;
  /** Groupe d'origine (header-group…) pour la classe CSS de l'enveloppe. */
  group?: string;
  /** Vrai pour `{% section 'x' %}` : les réglages viennent de settings_data. */
  static?: boolean;
};

export class RenderState {
  readonly stylesheets: string[] = [];
  readonly javascripts: string[] = [];
  readonly fonts = new FontCollector();
  /** Blocs stylesheet/javascript déjà collectés (un par fichier de section, comme Shopify). */
  readonly assetKeys = new Set<string>();
  /** Layout choisi par le gabarit : undefined → theme.liquid, null → aucun. */
  layout: string | null | undefined = undefined;
  /** Réglages du thème convertis (couleurs, polices…), remplis par le moteur après construction. */
  settings: Record<string, unknown> = {};
  /** Résolution des réglages produit/collection/image… vers les données de la page. */
  resolver: Resolver = {};
  constructor(
    readonly engine: EngineApi,
    readonly source: ThemeSource,
    readonly data: PageData,
    readonly translations: Dict,
    readonly schemes: SchemeDrop[],
    readonly sectionSettings: Record<string, Partial<SectionInstance>>,
    readonly globals: Record<string, unknown>,
  ) {}
  get designMode() { return !!this.data.design_mode; }
  get rootUrl() { return this.data.routes?.root_url || "/"; }
}

/** Récupère l'état de rendu depuis un contexte liquidjs (undefined hors d'un rendu de page). */
export function stateOf(ctx: Context): RenderState | undefined {
  return (ctx.globals as Record<symbol, unknown>)[RS] as RenderState | undefined;
}
