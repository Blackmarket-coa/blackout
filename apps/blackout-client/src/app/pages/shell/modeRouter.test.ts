import { describe, expect, it } from 'vitest';
import {
    isShellModeRoot,
    isShellPathActive,
    resolveShellMode,
    SHELL_MODE_TITLES,
} from './modeRouter';

describe('resolveShellMode', () => {
    it('maps root and /home onto discovery mode', () => {
        expect(resolveShellMode('/')).toBe('discovery');
        expect(resolveShellMode('/home/')).toBe('discovery');
        expect(resolveShellMode('/explore')).toBe('discovery');
        expect(resolveShellMode('/topics/safety')).toBe('discovery');
    });

    it('maps canopy/den paths onto community mode', () => {
        expect(resolveShellMode('/communities')).toBe('community');
        expect(resolveShellMode('/communities/!c:server/dens/!d:server')).toBe('community');
        // The canopies hub is the browse face of the same mode, so the
        // mobile top bar gets a real title instead of mode "other"'s blank.
        expect(resolveShellMode('/canopies')).toBe('community');
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

    it('maps the primary destinations onto their own modes', () => {
        expect(resolveShellMode('/streaming')).toBe('streaming');
        expect(resolveShellMode('/coalition')).toBe('coalition');
        expect(resolveShellMode('/coliseum')).toBe('coliseum');
    });

    it('maps the /creator-hub alias to streaming, not the creator dashboard', () => {
        expect(resolveShellMode('/creator-hub')).toBe('streaming');
        // The broader /creator prefix still resolves the dashboard.
        expect(resolveShellMode('/creator')).toBe('creator');
    });

    it('returns "other" for unrecognized routes', () => {
        expect(resolveShellMode('/moderation/draupnir')).toBe('other');
        expect(resolveShellMode('/governance')).toBe('other');
        expect(resolveShellMode('/some-feature')).toBe('other');
    });
});

describe('isShellModeRoot', () => {
    it('treats the primary destinations as roots (no back affordance)', () => {
        expect(isShellModeRoot('/streaming')).toBe(true);
        expect(isShellModeRoot('/coalition')).toBe(true);
        expect(isShellModeRoot('/coliseum/')).toBe(true);
        expect(isShellModeRoot('/canopies')).toBe(true);
    });

    it('treats leaf views as non-roots', () => {
        expect(isShellModeRoot('/coliseum/some-topic')).toBe(false);
        expect(isShellModeRoot('/streaming/clips')).toBe(false);
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
