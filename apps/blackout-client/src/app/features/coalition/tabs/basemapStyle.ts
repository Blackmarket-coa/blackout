import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { layers as protomapsLayers, LIGHT, type Flavor } from '@protomaps/basemaps';
import { API_BASE_URL } from '../../../sdk/apiBaseUrl';

/**
 * The coalition map's background (streets, water, place names), drawn from this
 * deployment's own tile server, so opening the map sends no request to anyone
 * else (`THREAT_MODEL.md` §3, boundary 8).
 *
 * The tile server is Martin (`infra/single-server-baseline/martin/`), reached
 * through nginx at `/tiles/` on the chat origin and on the API host. It serves:
 * - `/tiles/basemap`: the basemap's TileJSON, read from `basemap.pmtiles`, a
 *   Protomaps extract the operator downloads once (`fetch-basemap.sh` there);
 * - `/tiles/font/<names>/<range>`: label glyphs, from the Noto Sans files
 *   checked in beside `martin.yaml`.
 * There is no fallback. Until 2026-11-17 the map loaded OpenStreetMap's public
 * tiles whenever no style was configured, which told OpenStreetMap the
 * viewer's address and the area they were looking at; now a deployment without
 * a basemap shows its pins on a plain background and says so.
 *
 * The layers are Protomaps' own style (`@protomaps/basemaps`), with three
 * changes: its fonts are the ones the tile server has, the points of interest
 * are left out, and so is every icon. Protomaps serves its icons and fonts from
 * its own site, and the map would ask that site for them.
 */

/** Source id of the basemap: Martin names a PMTiles source after its file. */
export const BASEMAP_SOURCE_ID = 'basemap';

/** Font names the style asks for; Martin names a font "<family> <style>". */
export const BASEMAP_FONTS = {
    regular: 'Noto Sans Regular',
    bold: 'Noto Sans Bold',
    italic: 'Noto Sans Italic',
    devanagari: 'Noto Sans Devanagari Regular',
} as const;

/** The Devanagari font as Protomaps names it in its own hosted glyph set. */
const PROTOMAPS_DEVANAGARI_FONT = 'Noto Sans Devanagari Regular v1';

export interface MapStyleEnv {
    /** A complete MapLibre style of the operator's own, used as it is. */
    VITE_MAPLIBRE_STYLE_URL?: string;
    /** Where the tile server is, when it is not at `<API>/tiles`. */
    VITE_MAP_TILES_URL?: string;
}

const viteEnv: MapStyleEnv =
    (typeof import.meta !== 'undefined'
        ? (import.meta as unknown as { env?: MapStyleEnv }).env
        : undefined) ?? {};

const currentOrigin = (): string =>
    typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';

/**
 * Absolute address of the tile server, without a trailing slash. MapLibre
 * fetches tiles from web workers, where a relative address does not resolve.
 *
 * `VITE_MAP_TILES_URL` when set; otherwise `/tiles` on the API, which is this
 * origin in production (nginx proxies `/tiles/` beside `/v1/`) and the API's own
 * host when `VITE_API_BASE_URL` names one (desktop and mobile builds).
 */
export function mapTilesBaseUrl(
    env: MapStyleEnv = viteEnv,
    apiBaseUrl: string = API_BASE_URL,
    origin: string = currentOrigin()
): string {
    const configured = env.VITE_MAP_TILES_URL?.trim();
    const base = configured || `${(apiBaseUrl || origin).replace(/\/+$/, '')}/tiles`;
    return new URL(base, origin).toString().replace(/\/+$/, '');
}

function localFont(name: string): string {
    return name === PROTOMAPS_DEVANAGARI_FONT ? BASEMAP_FONTS.devanagari : name;
}

/** Replace Protomaps' Devanagari font name, wherever an expression holds it. */
function withLocalFonts(value: unknown): unknown {
    if (typeof value === 'string') return localFont(value);
    if (Array.isArray(value)) return value.map(withLocalFonts);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, withLocalFonts(entry)])
        );
    }
    return value;
}

const withoutIconKeys = (properties: object): Record<string, unknown> =>
    Object.fromEntries(Object.entries(properties).filter(([key]) => !key.startsWith('icon-')));

/**
 * Drop each icon: a symbol layer that only draws an icon goes, and one that
 * also draws text keeps its text and loses its icon properties.
 */
function withoutIcons(layers: LayerSpecification[]): LayerSpecification[] {
    const kept: LayerSpecification[] = [];
    for (const layer of layers) {
        if (layer.type !== 'symbol') {
            kept.push(layer);
            continue;
        }
        if (layer.layout && 'icon-image' in layer.layout && !('text-field' in layer.layout)) {
            continue;
        }
        kept.push({
            ...layer,
            ...(layer.layout ? { layout: withoutIconKeys(layer.layout) } : {}),
            ...(layer.paint ? { paint: withoutIconKeys(layer.paint) } : {}),
        } as LayerSpecification);
    }
    return kept;
}

/** The style for a tile server at `tilesBase` (see `mapTilesBaseUrl`). */
export function buildBasemapStyle(tilesBase: string): StyleSpecification {
    const flavor: Flavor = {
        ...LIGHT,
        regular: BASEMAP_FONTS.regular,
        bold: BASEMAP_FONTS.bold,
        italic: BASEMAP_FONTS.italic,
        pois: undefined,
    };
    const layers = withoutIcons(protomapsLayers(BASEMAP_SOURCE_ID, flavor, { lang: 'en' })).map(
        (layer) => withLocalFonts(layer) as LayerSpecification
    );
    return {
        version: 8,
        glyphs: `${tilesBase}/font/{fontstack}/{range}`,
        sources: {
            [BASEMAP_SOURCE_ID]: {
                type: 'vector',
                // TileJSON: Martin answers with the extract's bounds and zoom
                // levels, so the map zooms in past the extract's last level.
                url: `${tilesBase}/${BASEMAP_SOURCE_ID}`,
                attribution: '© OpenStreetMap contributors',
            },
        },
        layers,
    };
}

/** What the map is drawn with: the operator's own style, or the basemap. */
export function resolveMapStyle(env: MapStyleEnv = viteEnv): string | StyleSpecification {
    const url = env.VITE_MAPLIBRE_STYLE_URL?.trim();
    return url ? url : buildBasemapStyle(mapTilesBaseUrl(env));
}

/**
 * Whether a MapLibre error event is the basemap failing to load: its TileJSON
 * or a tile. Martin answers 404 for a source it does not have and 204 for a
 * tile the extract does not cover, so a missing extract shows up here and an
 * edge of the extract does not.
 */
export function isBasemapError(
    event: { sourceId?: unknown; error?: unknown },
    tilesBase: string
): boolean {
    if (event.sourceId === BASEMAP_SOURCE_ID) return true;
    const { error } = event;
    const url = error && typeof error === 'object' ? (error as { url?: unknown }).url : undefined;
    if (typeof url !== 'string') return false;
    const source = `${tilesBase}/${BASEMAP_SOURCE_ID}`;
    return url === source || url.startsWith(`${source}/`) || url.startsWith(`${source}?`);
}
