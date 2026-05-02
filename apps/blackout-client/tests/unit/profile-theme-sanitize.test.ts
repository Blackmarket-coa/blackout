import { describe, expect, it } from 'vitest';
import {
    sanitizeProfileEvent,
    sanitizeProfileThemeTokenValue,
    type BmcProfileEvent,
} from '../../src/app/features/profile/profileTypes';

describe('sanitizeProfileThemeTokenValue', () => {
    it('accepts hex colors', () => {
        expect(sanitizeProfileThemeTokenValue('accent', '#abc')).toBe('#abc');
        expect(sanitizeProfileThemeTokenValue('panelBg', '#1abc9c')).toBe('#1abc9c');
        expect(sanitizeProfileThemeTokenValue('panelFg', '#1abc9cff')).toBe('#1abc9cff');
    });

    it('accepts rgb()/hsl()/named colors', () => {
        expect(sanitizeProfileThemeTokenValue('linkColor', 'rgb(0, 0, 0)')).toBe('rgb(0, 0, 0)');
        expect(sanitizeProfileThemeTokenValue('linkColor', 'rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
        expect(sanitizeProfileThemeTokenValue('linkColor', 'hsl(120,50%,50%)')).toBe('hsl(120,50%,50%)');
        expect(sanitizeProfileThemeTokenValue('headerBg', 'tomato')).toBe('tomato');
    });

    it('accepts simple font-family values', () => {
        expect(sanitizeProfileThemeTokenValue('fontFamily', 'Inter, sans-serif')).toBe(
            'Inter, sans-serif',
        );
        expect(sanitizeProfileThemeTokenValue('fontFamily', "'Helvetica Neue'")).toBe(
            "'Helvetica Neue'",
        );
    });

    it('rejects url(), expression(), and at-rules', () => {
        expect(
            sanitizeProfileThemeTokenValue('panelBg', 'url(http://evil.example/track.png)'),
        ).toBeNull();
        expect(sanitizeProfileThemeTokenValue('accent', 'expression(alert(1))')).toBeNull();
        expect(sanitizeProfileThemeTokenValue('accent', '@import "evil.css"')).toBeNull();
        expect(sanitizeProfileThemeTokenValue('accent', 'behavior:url(x.htc)')).toBeNull();
    });

    it('rejects values containing CSS escape characters', () => {
        expect(sanitizeProfileThemeTokenValue('accent', 'red; background: url(x)')).toBeNull();
        expect(sanitizeProfileThemeTokenValue('accent', '} body { color: red')).toBeNull();
        expect(sanitizeProfileThemeTokenValue('accent', '<script>')).toBeNull();
        expect(sanitizeProfileThemeTokenValue('panelBg', 'red"')).toBeNull();
    });

    it('rejects empty / whitespace-only values', () => {
        expect(sanitizeProfileThemeTokenValue('accent', '')).toBeNull();
        expect(sanitizeProfileThemeTokenValue('accent', '   ')).toBeNull();
    });
});

describe('sanitizeProfileEvent — new fields', () => {
    it('clamps topFriends to 12 and validates Matrix user ids', () => {
        const ids = Array.from({ length: 20 }, (_, i) => `@user${i}:server.example`);
        ids.push('not-a-matrix-id');
        ids.push('@user0:server.example'); // duplicate
        const sanitized = sanitizeProfileEvent({ topFriends: { userIds: ids } });
        expect(sanitized.topFriends?.userIds).toHaveLength(12);
        expect(sanitized.topFriends?.userIds).not.toContain('not-a-matrix-id');
        const seen = new Set(sanitized.topFriends?.userIds ?? []);
        expect(seen.size).toBe(12);
    });

    it('drops customTheme entirely if no token survives validation', () => {
        const sanitized = sanitizeProfileEvent({
            customTheme: { tokens: { accent: 'url(http://e/x)', panelBg: '@import' } },
        });
        expect(sanitized.customTheme).toBeUndefined();
    });

    it('keeps the valid subset of customTheme tokens', () => {
        const sanitized = sanitizeProfileEvent({
            customTheme: {
                tokens: {
                    accent: '#1abc9c',
                    panelBg: 'url(http://e/x)', // dropped
                    fontFamily: 'Inter, sans-serif',
                },
            },
        });
        expect(sanitized.customTheme?.tokens?.accent).toBe('#1abc9c');
        expect(sanitized.customTheme?.tokens?.panelBg).toBeUndefined();
        expect(sanitized.customTheme?.tokens?.fontFamily).toBe('Inter, sans-serif');
    });

    it('drops empty status text and clamps to 140 chars', () => {
        const sanitized1 = sanitizeProfileEvent({ status: { text: '   ' } });
        expect(sanitized1.status).toBeUndefined();

        const long = 'a'.repeat(200);
        const sanitized2 = sanitizeProfileEvent({ status: { text: long, emoji: '🌱' } });
        expect(sanitized2.status?.text).toHaveLength(140);
        expect(sanitized2.status?.emoji).toBe('🌱');
    });

    it('validates wall enums and falls back to defaults', () => {
        const sanitized = sanitizeProfileEvent({
            wall: { visibility: 'bogus', whoCanPost: 'anyone', moderation: 'evil' },
        });
        expect(sanitized.wall).toEqual({
            visibility: 'public',
            whoCanPost: 'anyone',
            moderation: 'open',
        });
    });

    it('validates pinnedMedia and rejects bad mxc/url shapes', () => {
        const sanitized = sanitizeProfileEvent({
            pinnedMedia: [
                { kind: 'audio', mxc: 'mxc://example.org/aBc-1', title: 'A song' },
                { kind: 'audio', mxc: 'http://nope', title: 'Bad' },
                { kind: 'article', url: 'https://news.example/post', title: 'Read this' },
                { kind: 'article', url: 'ftp://blocked', title: 'No' },
                { kind: 'image', mxc: 'mxc://example.org/img-1', alt: 'pic' },
                { kind: 'video', mxc: 'mxc://example.org/vid-1' },
                { kind: 'unknown' as never },
            ],
        });
        expect(sanitized.pinnedMedia).toHaveLength(4);
        expect(sanitized.pinnedMedia?.map((m) => m.kind).sort()).toEqual([
            'article',
            'audio',
            'image',
            'video',
        ]);
    });

    it('clamps pinnedMedia to 8 entries', () => {
        const items = Array.from({ length: 16 }, (_, i) => ({
            kind: 'audio' as const,
            mxc: `mxc://example.org/track-${i}`,
            title: `Track ${i}`,
        }));
        const sanitized = sanitizeProfileEvent({ pinnedMedia: items });
        expect(sanitized.pinnedMedia).toHaveLength(8);
    });

    it('preserves legacy fields (banner, bio, pronouns, connections, decoration)', () => {
        const event: BmcProfileEvent = {
            banner: 'https://example.org/banner.png',
            bio: 'hello',
            pronouns: 'they/them',
            connections: [{ type: 'github', url: 'https://github.com/x' }],
            decoration: 'ring-solarpunk-01',
        };
        const sanitized = sanitizeProfileEvent(event);
        expect(sanitized.banner).toBe(event.banner);
        expect(sanitized.bio).toBe('hello');
        expect(sanitized.pronouns).toBe('they/them');
        expect(sanitized.connections).toHaveLength(1);
        expect(sanitized.decoration).toBe('ring-solarpunk-01');
    });
});
