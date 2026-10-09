import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideEmbedLink, openInNewTopLevelTab } from './embedLinks';

const ORIGIN = 'https://chat.example.org';

describe('decideEmbedLink', () => {
    it('keeps links to things the panel shows inside the panel', () => {
        expect(decideEmbedLink('/communities/!c%3As/dens/!d%3As?event=%24e', ORIGIN)).toEqual({
            action: 'in-panel',
            path: '/embed/canopies/!c%3As/dens/!d%3As?event=%24e',
        });
        expect(decideEmbedLink(`${ORIGIN}/messages/locked-in/!m%3As/`, ORIGIN)).toEqual({
            action: 'in-panel',
            path: '/embed/dms/!m%3As',
        });
        expect(decideEmbedLink('/embed/dms/!m%3As', ORIGIN)).toEqual({
            action: 'in-panel',
            path: '/embed/dms/!m%3As',
        });
    });

    // `it.each` is not in the src/ vitest type stub (src/vitest.d.ts); loop instead.
    for (const href of ['/', '/coliseum', '/market', '/feed/', '/settings', '/login']) {
        it(`sends ${href} to a normal Blackout tab`, () => {
            expect(decideEmbedLink(href, ORIGIN)).toEqual({
                action: 'blackout-tab',
                url: `${ORIGIN}${href}`,
            });
        });
    }

    it('sends a forced link to a Blackout tab even when the panel could show it', () => {
        expect(decideEmbedLink('/communities/!c%3As', ORIGIN, { forceTab: true })).toEqual({
            action: 'blackout-tab',
            url: `${ORIGIN}/communities/!c%3As`,
        });
    });

    it('sends other sites to a new tab', () => {
        expect(decideEmbedLink('https://evil.example/login', ORIGIN)).toEqual({
            action: 'external-tab',
            url: 'https://evil.example/login',
        });
        // Same host, different scheme or port: a different origin.
        expect(decideEmbedLink('http://chat.example.org/', ORIGIN).action).toBe('external-tab');
        expect(decideEmbedLink('https://chat.example.org:8443/', ORIGIN).action).toBe(
            'external-tab'
        );
        expect(decideEmbedLink('//evil.example/x', ORIGIN)).toEqual({
            action: 'external-tab',
            url: 'https://evil.example/x',
        });
    });

    it('leaves non-web links to the browser and swallows script URLs', () => {
        expect(decideEmbedLink('mailto:a@example.org', ORIGIN)).toEqual({ action: 'default' });
        expect(decideEmbedLink('mxc://example.org/abc', ORIGIN)).toEqual({ action: 'default' });
        // eslint-disable-next-line no-script-url
        expect(decideEmbedLink('javascript:alert(1)', ORIGIN)).toEqual({ action: 'ignore' });
        expect(decideEmbedLink('http://[bad', ORIGIN)).toEqual({ action: 'ignore' });
    });
});

describe('openInNewTopLevelTab', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens a new top-level tab with no opener and no referrer', () => {
        const open = vi.fn();
        vi.stubGlobal('window', { open });
        openInNewTopLevelTab('https://chat.example.org/coliseum');
        expect(open).toHaveBeenCalledWith(
            'https://chat.example.org/coliseum',
            '_blank',
            'noopener,noreferrer'
        );
    });
});
