// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeCanShare, nativeShare } from '../../src/platform/nativeMediaBridge';

const originalNavigator = globalThis.navigator;

const buildNavigator = (overrides: Partial<{
    share: (data: ShareData) => Promise<void>;
    clipboard: { writeText: (data: string) => Promise<void> };
}>) => {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { ...originalNavigator, ...overrides },
    });
};

const restoreNavigator = () => {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
    });
};

describe('nativeShare', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        restoreNavigator();
        vi.restoreAllMocks();
    });

    it('reports unsupported when no transport is available', async () => {
        buildNavigator({});
        const result = await nativeShare({ title: 'hello', text: 'world' });
        expect(result).toBe('unsupported');
    });

    it('uses the Web Share API when navigator.share exists', async () => {
        const share = vi.fn(async (_data: ShareData) => undefined);
        buildNavigator({ share });

        const result = await nativeShare({ title: 't', text: 'x', url: 'https://example.com' });
        expect(result).toBe('web-share');
        expect(share).toHaveBeenCalledWith({
            title: 't',
            text: 'x',
            url: 'https://example.com',
        });
    });

    it('falls back to the clipboard when navigator.share rejects', async () => {
        const share = vi.fn(async () => {
            throw new Error('share denied');
        });
        const writeText = vi.fn(async (_text: string) => undefined);
        buildNavigator({ share, clipboard: { writeText } });

        const result = await nativeShare({ url: 'https://example.com/room' });
        expect(result).toBe('clipboard');
        expect(writeText).toHaveBeenCalledWith('https://example.com/room');
    });

    it('falls back to the clipboard with text when no url is provided', async () => {
        const writeText = vi.fn(async (_text: string) => undefined);
        buildNavigator({ clipboard: { writeText } });

        const result = await nativeShare({ text: 'fallback body' });
        expect(result).toBe('clipboard');
        expect(writeText).toHaveBeenCalledWith('fallback body');
    });

    it('reports unsupported when clipboard write rejects and no other transport exists', async () => {
        const writeText = vi.fn(async () => {
            throw new Error('denied');
        });
        buildNavigator({ clipboard: { writeText } });

        const result = await nativeShare({ url: 'https://example.com' });
        expect(result).toBe('unsupported');
    });
});

describe('nativeCanShare', () => {
    afterEach(() => {
        restoreNavigator();
    });

    it('returns true when navigator.share exists', () => {
        buildNavigator({ share: async () => undefined });
        expect(nativeCanShare()).toBe(true);
    });

    it('returns true when only clipboard.writeText exists', () => {
        buildNavigator({ clipboard: { writeText: async () => undefined } });
        expect(nativeCanShare()).toBe(true);
    });

    it('returns false when neither web share nor clipboard are available', () => {
        buildNavigator({});
        expect(nativeCanShare()).toBe(false);
    });
});
