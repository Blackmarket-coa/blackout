import { describe, expect, it } from 'vitest';
import { isShellPathActive, resolveShellMode, SHELL_MODE_TITLES } from './modeRouter';

describe('resolveShellMode', () => {
    it('maps root and /home onto discovery mode', () => {
        expect(resolveShellMode('/')).toBe('discovery');
        expect(resolveShellMode('/home/')).toBe('discovery');
        expect(resolveShellMode('/explore')).toBe('discovery');
        expect(resolveShellMode('/topics/safety')).toBe('discovery');
    });

    it('maps canopy/den paths and the legacy room form onto community mode', () => {
        expect(resolveShellMode('/communities')).toBe('community');
        expect(resolveShellMode('/communities/!c:server/dens/!d:server')).toBe('community');
        expect(resolveShellMode('/room/!d:server')).toBe('community');
    });

    it('maps livestream, marketplace, creator, inbox and events paths onto distinct modes', () => {
        expect(resolveShellMode('/live')).toBe('livestream');
        expect(resolveShellMode('/live/abc')).toBe('livestream');
        expect(resolveShellMode('/market')).toBe('marketplace');
        expect(resolveShellMode('/market/listings/123')).toBe('marketplace');
        expect(resolveShellMode('/creator')).toBe('creator');
        expect(resolveShellMode('/creators/@alice:server')).toBe('creator');
        expect(resolveShellMode('/messages/')).toBe('inbox');
        expect(resolveShellMode('/inbox/')).toBe('inbox');
        expect(resolveShellMode('/direct/')).toBe('inbox');
        expect(resolveShellMode('/events')).toBe('events');
    });

    it('returns "other" for unrecognized routes', () => {
        expect(resolveShellMode('/moderation/draupnir')).toBe('other');
        expect(resolveShellMode('/governance')).toBe('other');
        expect(resolveShellMode('/some-feature')).toBe('other');
    });
});

describe('isShellPathActive', () => {
    it('treats root as active for / and /home subtree', () => {
        expect(isShellPathActive('/', '/')).toBe(true);
        expect(isShellPathActive('/home/', '/')).toBe(true);
        expect(isShellPathActive('/communities', '/')).toBe(false);
    });

    it('matches on subtree but not on prefix collisions', () => {
        expect(isShellPathActive('/communities', '/communities')).toBe(true);
        expect(isShellPathActive('/communities/!c:server', '/communities')).toBe(true);
        // Avoid /communitiesX false-positive (no `/` separator).
        expect(isShellPathActive('/communitiesX', '/communities')).toBe(false);
        expect(isShellPathActive('/market', '/communities')).toBe(false);
    });

    it('strips trailing slash on `to` for symmetric comparison', () => {
        expect(isShellPathActive('/messages/', '/messages/')).toBe(true);
        expect(isShellPathActive('/messages/inbox', '/messages/')).toBe(true);
    });
});

describe('SHELL_MODE_TITLES', () => {
    it('provides a non-empty title for every mode except "other"', () => {
        const modes = Object.keys(SHELL_MODE_TITLES) as Array<keyof typeof SHELL_MODE_TITLES>;
        for (const mode of modes) {
            if (mode === 'other') {
                expect(SHELL_MODE_TITLES[mode]).toBe('');
            } else {
                expect(SHELL_MODE_TITLES[mode].length).toBeGreaterThan(0);
            }
        }
    });
});
