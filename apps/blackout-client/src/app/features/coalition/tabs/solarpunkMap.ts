/**
 * Solarpunk visual language for the coalition map. Scoped to the Map tab and
 * applied unconditionally (independent of the global theme), so the map always
 * reads as a warm, botanical, sunlit world: lush greens for land + people,
 * golds/amber for energy + commerce, ember/clay for care + gathering, dusk for
 * governance + the mycelial federation.
 *
 * Colors are not invented here — they are pulled from the shared, theme-stable
 * `PLAYBOOK_ACCENT_TOKENS` palette (the same swatches the mycelium layer uses),
 * so a Grove looks like itself everywhere. Per-layer identity is carried first
 * by the ICON (a botanical/solar glyph) and secondarily by hue, so occasional
 * hue reuse across unrelated layers is fine — the glyph disambiguates.
 */
import { PLAYBOOK_ACCENT_TOKENS } from '../../../styles/playbookTokens';

/** A single SVG child element spec — built via the DOM, never parsed markup. */
export type IconEl =
    | { tag: 'path'; d: string }
    | { tag: 'circle'; cx: number; cy: number; r: number }
    | { tag: 'rect'; x: number; y: number; width: number; height: number; rx?: number }
    | { tag: 'polygon'; points: string };

export interface SolarpunkLayerStyle {
    /** Badge fill (token `solid`). */
    color: string;
    /** Glyph stroke / popup ink (token `ink`) — chosen for contrast on `color`. */
    ink: string;
    /** Structured glyph for a 0 0 24 24 viewBox, stroke-rendered via the DOM. */
    icon: readonly IconEl[];
}

const p = (d: string): IconEl => ({ tag: 'path', d });
const c = (cx: number, cy: number, r: number): IconEl => ({ tag: 'circle', cx, cy, r });
const rect = (x: number, y: number, width: number, height: number, rx?: number): IconEl => ({
    tag: 'rect',
    x,
    y,
    width,
    height,
    rx,
});
const poly = (points: string): IconEl => ({ tag: 'polygon', points });

// Lucide-style single-stroke glyphs. Static, structured specs (no markup
// parsing, no user input) — built as DOM nodes in `buildLayerIconSvg`.
const ICONS = {
    sprout: [
        p('M7 20h10'),
        p('M10 20c5.5-2.5.8-6.4 3-10'),
        p(
            'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4 2.5-.3 4.2-.1 5.5.6z'
        ),
        p('M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z'),
    ],
    sun: [
        c(12, 12, 4),
        p(
            'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4'
        ),
    ],
    calendar: [rect(3, 4, 18, 18, 2), p('M16 2v4M8 2v4M3 10h18')],
    heart: [
        p(
            'M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7Z'
        ),
    ],
    bag: [
        p('M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z'),
        p('M3 6h18'),
        p('M16 10a4 4 0 0 1-8 0'),
    ],
    briefcase: [rect(2, 7, 20, 14, 2), p('M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16')],
    vote: [p('m9 12 2 2 4-4'), p('M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z'), p('M22 19H2')],
    tent: [p('M3.5 21 14 3'), p('M20.5 21 10 3'), p('M15.5 21 12 15l-3.5 6'), p('M2 21h20')],
    play: [poly('6 3 20 12 6 21 6 3')],
    wrench: [
        p(
            'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z'
        ),
    ],
    users: [
        p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'),
        c(9, 7, 4),
        p('M22 21v-2a4 4 0 0 0-3-3.87'),
        p('M16 3.13a4 4 0 0 1 0 7.75'),
    ],
    mushroom: [p('M4 11a8 8 0 0 1 16 0Z'), p('M10 11v5a2 2 0 1 0 4 0v-5')],
} as const;

const T = PLAYBOOK_ACCENT_TOKENS;

/** Per-layer solarpunk style, keyed by `SpatialLayerKey` (see core taxonomy). */
export const SOLARPUNK_LAYER_STYLE: Record<string, SolarpunkLayerStyle> = {
    video: { color: T.ember.solid, ink: T.ember.ink, icon: ICONS.play },
    gardens: { color: T.fern.solid, ink: T.fern.ink, icon: ICONS.sprout },
    communities: { color: T.moss.solid, ink: T.moss.ink, icon: ICONS.users },
    dens: { color: T.pine.solid, ink: T.pine.ink, icon: ICONS.tent },
    projects: { color: T.moss.solid, ink: T.moss.ink, icon: ICONS.wrench },
    infra: { color: T.saffron.solid, ink: T.saffron.ink, icon: ICONS.sun },
    events: { color: T.ember.solid, ink: T.ember.ink, icon: ICONS.calendar },
    vendors: { color: T.clay.solid, ink: T.clay.ink, icon: ICONS.bag },
    jobs: { color: T.slate.solid, ink: T.slate.ink, icon: ICONS.briefcase },
    aid: { color: T.ember.solid, ink: T.ember.ink, icon: ICONS.heart },
    // Needs read as asks (a heart, like mutual aid) and resources as shared
    // capacity (a wrench, like projects) — but each keeps its own hue, so the
    // legend can distinguish them at a glance.
    needs: { color: T.clay.solid, ink: T.clay.ink, icon: ICONS.heart },
    resources: { color: T.pine.solid, ink: T.pine.ink, icon: ICONS.wrench },
    votes: { color: T.dusk.solid, ink: T.dusk.ink, icon: ICONS.vote },
    streams: { color: T.lichen.solid, ink: T.lichen.ink, icon: ICONS.play },
    mycelium: { color: T.dusk.solid, ink: T.dusk.ink, icon: ICONS.mushroom },
};

export const DEFAULT_LAYER_STYLE: SolarpunkLayerStyle = {
    color: T.lichen.solid,
    ink: T.lichen.ink,
    icon: ICONS.sprout,
};

export function layerStyleFor(layer: string): SolarpunkLayerStyle {
    return SOLARPUNK_LAYER_STYLE[layer] ?? DEFAULT_LAYER_STYLE;
}

/** Warm "you are here" marker (saffron), replacing the cool blue default. */
export const VIEWER_MARKER_COLOR = T.saffron.solid;

/** Active accent for the Map tab's non-layer control pills (warm gold). */
export const SOLARPUNK_CONTROL_ACTIVE = { bg: T.saffron.solid, ink: T.saffron.ink };

/** Sunlit wash behind the map canvas, replacing the cool teal radial glow. */
export const SOLARPUNK_PANEL_GLOW =
    'radial-gradient(circle at 28% 22%, rgba(214,154,46,0.16), transparent 58%),' +
    ' radial-gradient(circle at 78% 88%, rgba(63,122,78,0.12), transparent 60%), var(--bg-input)';

/** Cream ring around badges, for a sunlit pop against tiles. */
export const MARKER_RING = '#FBF4E6';

/** CSS class applied to the map container to scope the solarpunk overrides. */
export const SOLARPUNK_MAP_CLASS = 'coalition-map--solarpunk';

/**
 * Canvas-only filter that warms the cool OSM raster toward golden daylight.
 * Applied to `.maplibregl-canvas` (the tile WebGL surface) so DOM markers,
 * labels, and popups stay crisp.
 */
export const SOLARPUNK_TILE_FILTER =
    'sepia(0.18) saturate(1.06) hue-rotate(-8deg) brightness(1.02) contrast(1.02)';

/**
 * Heatmap color ramp: a sunlit bloom (spring green → gold → amber → terracotta
 * → clay) instead of MapLibre's default blue→red. Consumed as the
 * `heatmap-color` paint expression.
 */
export const SOLARPUNK_HEAT_RAMP = [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(0,0,0,0)',
    0.2,
    'rgba(159,212,85,0.45)',
    0.4,
    '#F2C14E',
    0.6,
    '#D69A2E',
    0.8,
    '#C66A2B',
    1,
    '#A45A45',
] as const;

const SOLARPUNK_STYLE_ID = 'coalition-solarpunk-map-styles';

/**
 * Inject the scoped solarpunk CSS once (mirrors `ensurePulseKeyframes`). Warms
 * the tiles and turns the popup into warm parchment. Idempotent.
 */
export function ensureSolarpunkMapStyles(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(SOLARPUNK_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SOLARPUNK_STYLE_ID;
    style.textContent = [
        `.${SOLARPUNK_MAP_CLASS} .maplibregl-canvas { filter: ${SOLARPUNK_TILE_FILTER}; }`,
        `.${SOLARPUNK_MAP_CLASS} .maplibregl-popup-content {`,
        '  background: #FBF4E6;',
        '  color: #1B130A;',
        '  border: 1px solid rgba(164, 90, 69, 0.5);',
        '  border-radius: 12px;',
        '  box-shadow: 0 6px 20px rgba(31, 90, 71, 0.25);',
        '}',
        `.${SOLARPUNK_MAP_CLASS} .maplibregl-popup-tip {`,
        '  border-top-color: #FBF4E6;',
        '  border-bottom-color: #FBF4E6;',
        '}',
    ].join('\n');
    document.head.appendChild(style);
}

/**
 * Build a 24×24 stroke SVG element for a layer glyph (static markup). `stroke`
 * defaults to the token ink (for colored badges); pass an override when the
 * glyph sits on a neutral surface (e.g. inactive control pills).
 */
export function buildLayerIconSvg(style: SolarpunkLayerStyle, stroke = style.ink): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', stroke);
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const ns = 'http://www.w3.org/2000/svg';
    for (const el of style.icon) {
        const node = document.createElementNS(ns, el.tag);
        for (const [key, value] of Object.entries(el)) {
            if (key === 'tag' || value === undefined) continue;
            node.setAttribute(key, String(value));
        }
        svg.appendChild(node);
    }
    return svg;
}
