import { describe, expect, it } from 'vitest';
import {
    buildEmbedCanopyPath,
    buildEmbedDenPath,
    buildEmbedDmPath,
    buildEmbedElsewherePath,
    canonicalDenPath,
    isEmbedPath,
    mapToEmbedPath,
    resolveElsewhereTarget,
} from './embedPaths';

const ORIGIN = 'https://chat.example.org';

describe('isEmbedPath', () => {
    it('accepts /embed and everything under /embed/', () => {
        expect(isEmbedPath('/embed')).toBe(true);
        expect(isEmbedPath('/embed/')).toBe(true);
        expect(isEmbedPath('/embed/dms/%21a%3Ab')).toBe(true);
    });

    it('rejects look-alikes and the rest of the app', () => {
        expect(isEmbedPath('/embedded')).toBe(false);
        expect(isEmbedPath('/embed-x')).toBe(false);
        expect(isEmbedPath('/')).toBe(false);
        expect(isEmbedPath('/communities/!c:s')).toBe(false);
        expect(isEmbedPath('/x/embed')).toBe(false);
    });
});

describe('panel path builders', () => {
    it('encodes Matrix ids', () => {
        expect(buildEmbedCanopyPath('!c:s')).toBe('/embed/canopies/!c%3As');
        expect(buildEmbedDenPath('!c:s', '!d:s')).toBe('/embed/canopies/!c%3As/dens/!d%3As');
        expect(buildEmbedDenPath(null, '!d:s')).toBe('/embed/dens/!d%3As');
        expect(buildEmbedDmPath('!m:s')).toBe('/embed/dms/!m%3As');
        expect(buildEmbedElsewherePath('/coliseum?x=1')).toBe(
            '/embed/elsewhere?to=%2Fcoliseum%3Fx%3D1'
        );
    });

    it('builds the canonical den path with the no-canopy sentinel', () => {
        expect(canonicalDenPath(null, '!d:s')).toBe('/communities/-/dens/!d%3As');
    });
});

describe('mapToEmbedPath', () => {
    it('maps the things the panel shows', () => {
        expect(mapToEmbedPath('/communities')).toBe('/embed');
        expect(mapToEmbedPath('/canopies')).toBe('/embed');
        expect(mapToEmbedPath('/communities/!c%3As')).toBe('/embed/canopies/!c%3As');
        expect(mapToEmbedPath('/communities/!c%3As/dens/!d%3As')).toBe(
            '/embed/canopies/!c%3As/dens/!d%3As'
        );
        expect(mapToEmbedPath('/communities/-/dens/!d%3As')).toBe('/embed/dens/!d%3As');
        expect(mapToEmbedPath('/messages/locked-in/')).toBe('/embed');
        expect(mapToEmbedPath('/messages/locked-in/!m%3As/')).toBe('/embed/dms/!m%3As');
        expect(mapToEmbedPath('/messages/locked-in/!m%3As/$event/')).toBe('/embed/dms/!m%3As');
    });

    it('returns panel paths unchanged', () => {
        expect(mapToEmbedPath('/embed/dms/!m%3As')).toBe('/embed/dms/!m%3As');
    });

    // `it.each` is not in the src/ vitest type stub (src/vitest.d.ts); loop instead.
    const outOfPanel = [
        '/',
        '/coliseum',
        '/coliseum/topics/t1',
        '/market',
        '/market/listings/p/l',
        '/feed/',
        '/home/',
        '/live/abc',
        '/settings',
        '/messages/',
        '/messages/notifications/',
        '/messages/invites/',
        '/messages/locked-in/create/',
        '/communities/!c%3As/settings',
        '/governance',
        '/explore/',
    ];
    for (const path of outOfPanel) {
        it(`keeps ${path} out of the panel`, () => {
            expect(mapToEmbedPath(path)).toBeNull();
        });
    }

    it('maps the den-less sentinel canopy to the panel home, not to a non-panel page', () => {
        expect(mapToEmbedPath('/communities/-')).toBe('/embed');
    });
});

describe('resolveElsewhereTarget', () => {
    it('accepts a same-origin absolute path', () => {
        expect(resolveElsewhereTarget('/coliseum?x=1#y', ORIGIN)).toBe(`${ORIGIN}/coliseum?x=1#y`);
    });

    const rejected: Array<string | null> = [
        null,
        '',
        'coliseum',
        '//evil.example/x',
        '/\\evil.example/x',
        'https://evil.example/x',
        'javascript:alert(1)',
        '/coli seum',
        '/coli\tseum',
        '/embed',
        '/embed/dms/!m%3As',
    ];
    for (const raw of rejected) {
        it(`rejects ${JSON.stringify(raw)}`, () => {
            expect(resolveElsewhereTarget(raw, ORIGIN)).toBeNull();
        });
    }
});
