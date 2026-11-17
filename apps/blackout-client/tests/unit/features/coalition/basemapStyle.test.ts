import { describe, expect, it } from 'vitest';
import type { LayerSpecification } from 'maplibre-gl';
import {
    BASEMAP_FONTS,
    BASEMAP_SOURCE_ID,
    buildBasemapStyle,
    isBasemapError,
    mapTilesBaseUrl,
    resolveMapStyle,
} from '../../../../src/app/features/coalition/tabs/basemapStyle';

const BASE = 'https://chat.example.org/tiles';

/**
 * The font names a layer asks for: its "text-font", and the "text-font" of each
 * section of a formatted "text-field" (where Protomaps puts the Devanagari
 * font). A font name has a space in it ("Noto Sans Regular"); the expression
 * words around it ("case", "get", "script", "Devanagari") do not.
 */
function fontsIn(layers: LayerSpecification[]): Set<string> {
    const found = new Set<string>();
    const names = (value: unknown): void => {
        if (typeof value === 'string' && value.includes(' ')) found.add(value);
        else if (Array.isArray(value)) value.forEach(names);
    };
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(visit);
        } else if (value && typeof value === 'object') {
            for (const [key, entry] of Object.entries(value)) {
                if (key === 'text-font') names(entry);
                else visit(entry);
            }
        }
    };
    for (const layer of layers) visit((layer as { layout?: unknown }).layout);
    return found;
}

describe('buildBasemapStyle', () => {
    const style = buildBasemapStyle(BASE);
    const serialized = JSON.stringify(style);

    it('names no address outside the tile server', () => {
        const addresses = serialized.match(/[a-z][a-z0-9+.-]*:\/\/[^"\s]+/gi) ?? [];
        expect(addresses.sort()).toEqual(
            [`${BASE}/${BASEMAP_SOURCE_ID}`, `${BASE}/font/{fontstack}/{range}`].sort()
        );
    });

    it("reads the basemap through Martin's TileJSON and the glyphs from its font route", () => {
        expect(style.glyphs).toBe(`${BASE}/font/{fontstack}/{range}`);
        expect(style.sources[BASEMAP_SOURCE_ID]).toMatchObject({
            type: 'vector',
            url: `${BASE}/basemap`,
        });
        expect(style.sprite).toBeUndefined();
    });

    it('asks only for the fonts checked in beside martin.yaml', () => {
        const fonts = [...fontsIn(style.layers)].sort();
        expect(fonts).toEqual(
            [
                BASEMAP_FONTS.bold,
                BASEMAP_FONTS.devanagari,
                BASEMAP_FONTS.italic,
                BASEMAP_FONTS.regular,
            ].sort()
        );
        // The Devanagari name Protomaps uses exists only in its own glyph set.
        expect(serialized).not.toContain('Devanagari Regular v1');
    });

    it('draws no icon, so it needs no sprite sheet', () => {
        for (const layer of style.layers) {
            const layout = (layer as { layout?: Record<string, unknown> }).layout ?? {};
            const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
            expect(Object.keys(layout).filter((key) => key.startsWith('icon-'))).toEqual([]);
            expect(Object.keys(paint).filter((key) => key.startsWith('icon-'))).toEqual([]);
        }
        expect(style.layers.find((layer) => layer.id === 'pois')).toBeUndefined();
    });

    it('keeps the text of a layer that drew an icon beside it', () => {
        const shields = style.layers.find((layer) => layer.id === 'roads_shields') as
            | { layout?: Record<string, unknown> }
            | undefined;
        expect(shields?.layout?.['text-field']).toBeDefined();
        expect(style.layers.find((layer) => layer.id === 'roads_oneway')).toBeUndefined();
    });

    it('starts with a background, so pins stay readable without the basemap', () => {
        expect(style.layers[0]).toMatchObject({ type: 'background' });
    });
});

describe('mapTilesBaseUrl', () => {
    const origin = 'https://chat.example.org';

    it('is /tiles on this origin when the API is same-origin (production)', () => {
        expect(mapTilesBaseUrl({}, '', origin)).toBe('https://chat.example.org/tiles');
    });

    it("is /tiles on the API's host when the build names one", () => {
        expect(mapTilesBaseUrl({}, 'https://api.example.org/', origin)).toBe(
            'https://api.example.org/tiles'
        );
    });

    it('is VITE_MAP_TILES_URL when set, made absolute', () => {
        expect(
            mapTilesBaseUrl({ VITE_MAP_TILES_URL: 'https://maps.example.org/t/' }, '', origin)
        ).toBe('https://maps.example.org/t');
        expect(mapTilesBaseUrl({ VITE_MAP_TILES_URL: '/map-tiles' }, '', origin)).toBe(
            'https://chat.example.org/map-tiles'
        );
        expect(mapTilesBaseUrl({ VITE_MAP_TILES_URL: '  ' }, '', origin)).toBe(
            'https://chat.example.org/tiles'
        );
    });
});

describe('resolveMapStyle', () => {
    it("uses the operator's own style when one is configured", () => {
        expect(resolveMapStyle({ VITE_MAPLIBRE_STYLE_URL: 'https://x.example/style.json' })).toBe(
            'https://x.example/style.json'
        );
    });

    it('otherwise builds the basemap style', () => {
        const style = resolveMapStyle({});
        expect(typeof style).toBe('object');
        expect(JSON.stringify(style)).toContain('/tiles/basemap');
    });
});

describe('isBasemapError', () => {
    it('is the basemap source, or a request to it', () => {
        expect(isBasemapError({ sourceId: 'basemap' }, BASE)).toBe(true);
        expect(isBasemapError({ error: { url: `${BASE}/basemap` } }, BASE)).toBe(true);
        expect(isBasemapError({ error: { url: `${BASE}/basemap/3/2/1` } }, BASE)).toBe(true);
    });

    it('is not a font, another source, or a source whose name starts the same', () => {
        expect(
            isBasemapError({ error: { url: `${BASE}/font/Noto Sans Regular/0-255` } }, BASE)
        ).toBe(false);
        expect(isBasemapError({ sourceId: 'coalition-heat' }, BASE)).toBe(false);
        expect(isBasemapError({ error: { url: `${BASE}/basemap2/1/1/1` } }, BASE)).toBe(false);
        expect(isBasemapError({ error: null }, BASE)).toBe(false);
    });
});
