// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    NATIVE_CHECKOUT_RETURN_URL,
    detectNativePlatform,
    openExternalCheckoutUrl,
    regionFromLanguageTag,
    resolveCheckoutReturnUrl,
    resolveDeviceRegion,
    resolveExternalPurchasePolicy,
} from './external-purchase';

type CapacitorStub = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, unknown>;
};

const setCapacitor = (stub: CapacitorStub | undefined) => {
    (window as unknown as { Capacitor?: CapacitorStub }).Capacitor = stub;
};

const setTauri = (
    invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined
) => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = invoke
        ? { core: { invoke } }
        : undefined;
};

afterEach(() => {
    setCapacitor(undefined);
    setTauri(undefined);
    vi.restoreAllMocks();
});

describe('regionFromLanguageTag', () => {
    it('extracts the region from common BCP-47 tags', () => {
        expect(regionFromLanguageTag('en-US')).toBe('US');
        expect(regionFromLanguageTag('pt-BR')).toBe('BR');
        expect(regionFromLanguageTag('de-DE')).toBe('DE');
    });

    it('tolerates underscore separators and script subtags', () => {
        expect(regionFromLanguageTag('en_US')).toBe('US');
        expect(regionFromLanguageTag('zh-Hans-CN')).toBe('CN');
    });

    it('returns null when no region is present', () => {
        expect(regionFromLanguageTag('en')).toBeNull();
        expect(regionFromLanguageTag('')).toBeNull();
        expect(regionFromLanguageTag(null)).toBeNull();
        expect(regionFromLanguageTag(undefined)).toBeNull();
        expect(regionFromLanguageTag('!!not-a-tag!!')).toBeNull();
    });
});

describe('resolveExternalPurchasePolicy', () => {
    it('keeps the embedded overlay on web/desktop', () => {
        expect(resolveExternalPurchasePolicy({ platform: null, region: 'PL' })).toEqual({
            allowed: true,
            mode: 'embedded',
            reason: 'web-platform',
        });
    });

    it('routes Android through the external browser regardless of region', () => {
        for (const region of ['US', 'DE', null]) {
            expect(resolveExternalPurchasePolicy({ platform: 'android', region })).toEqual({
                allowed: true,
                mode: 'external-browser',
                reason: 'android-external-checkout',
            });
        }
    });

    it('allows the iOS link-out only on the US storefront', () => {
        expect(resolveExternalPurchasePolicy({ platform: 'ios', region: 'US' })).toEqual({
            allowed: true,
            mode: 'external-browser',
            reason: 'ios-us-storefront-link-out',
        });
    });

    it('fails closed on iOS outside the US — including unknown regions', () => {
        for (const region of ['PL', 'GB', null]) {
            expect(resolveExternalPurchasePolicy({ platform: 'ios', region })).toEqual({
                allowed: false,
                mode: 'blocked',
                reason: 'ios-storefront-not-us',
            });
        }
    });
});

describe('detectNativePlatform', () => {
    it('returns null without the Capacitor bridge', () => {
        expect(detectNativePlatform()).toBeNull();
    });

    it('returns the platform reported by the bridge', () => {
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
        expect(detectNativePlatform()).toBe('ios');
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'android' });
        expect(detectNativePlatform()).toBe('android');
    });

    it('returns null for non-native or unexpected platforms', () => {
        setCapacitor({ isNativePlatform: () => false, getPlatform: () => 'ios' });
        expect(detectNativePlatform()).toBeNull();
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'web' });
        expect(detectNativePlatform()).toBeNull();
    });
});

describe('resolveDeviceRegion', () => {
    it('prefers the Device plugin language tag', async () => {
        setCapacitor({
            isNativePlatform: () => true,
            Plugins: {
                Device: { getLanguageTag: async () => ({ value: 'fr-CA' }) },
            },
        });
        await expect(resolveDeviceRegion()).resolves.toBe('CA');
    });

    it('falls back to navigator.language when the plugin fails', async () => {
        setCapacitor({
            isNativePlatform: () => true,
            Plugins: {
                Device: {
                    getLanguageTag: async () => {
                        throw new Error('boom');
                    },
                },
            },
        });
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');
        await expect(resolveDeviceRegion()).resolves.toBe('US');
    });

    it('falls back to navigator.language without the plugin', async () => {
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('es-MX');
        await expect(resolveDeviceRegion()).resolves.toBe('MX');
    });
});

describe('openExternalCheckoutUrl', () => {
    it('opens https links in the system browser inside the Tauri desktop shell', async () => {
        const invoke = vi.fn(async () => undefined);
        const open = vi.spyOn(window, 'open');
        setTauri(invoke);
        await expect(openExternalCheckoutUrl('https://fbm.example/billing/abc')).resolves.toBe(
            'system-browser'
        );
        expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', {
            url: 'https://fbm.example/billing/abc',
        });
        expect(open).not.toHaveBeenCalled();
    });

    it('falls back to window.open when the desktop opener refuses or is missing', async () => {
        setTauri(vi.fn(async () => Promise.reject(new Error('not allowed'))));
        const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        await expect(openExternalCheckoutUrl('https://fbm.example/billing/abc')).resolves.toBe(
            'window-open'
        );
        expect(open).toHaveBeenCalledWith(
            'https://fbm.example/billing/abc',
            '_blank',
            'noopener,noreferrer'
        );
    });

    it('never hands a non-https link to the desktop opener (local dev http stays in window.open)', async () => {
        const invoke = vi.fn(async () => undefined);
        setTauri(invoke);
        vi.spyOn(window, 'open').mockReturnValue({} as Window);
        await expect(openExternalCheckoutUrl('http://localhost:9000/checkout')).resolves.toBe(
            'window-open'
        );
        await expect(openExternalCheckoutUrl('javascript:alert(1)')).resolves.toBe('failed');
        expect(invoke).not.toHaveBeenCalled();
    });

    it('rejects malformed and non-https URLs', async () => {
        await expect(openExternalCheckoutUrl('not a url')).resolves.toBe('failed');
        await expect(openExternalCheckoutUrl('javascript:alert(1)')).resolves.toBe('failed');
        await expect(openExternalCheckoutUrl('http://evil.example/checkout')).resolves.toBe(
            'failed'
        );
    });

    it('allows plain http only for local dev checkouts', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        await expect(openExternalCheckoutUrl('http://localhost:9000/checkout')).resolves.toBe(
            'window-open'
        );
        expect(open).toHaveBeenCalledWith(
            'http://localhost:9000/checkout',
            '_blank',
            'noopener,noreferrer'
        );
    });

    it('uses the Capacitor Browser plugin inside the shells', async () => {
        const browserOpen = vi.fn(async () => undefined);
        setCapacitor({
            isNativePlatform: () => true,
            getPlatform: () => 'ios',
            Plugins: { Browser: { open: browserOpen } },
        });
        await expect(openExternalCheckoutUrl('https://checkout.example/session')).resolves.toBe(
            'capacitor-browser'
        );
        expect(browserOpen).toHaveBeenCalledWith({
            url: 'https://checkout.example/session',
            presentationStyle: 'fullscreen',
        });
    });

    it('falls back to window.open when the plugin call fails', async () => {
        setCapacitor({
            isNativePlatform: () => true,
            getPlatform: () => 'android',
            Plugins: {
                Browser: {
                    open: async () => {
                        throw new Error('no browser');
                    },
                },
            },
        });
        const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        await expect(openExternalCheckoutUrl('https://checkout.example/session')).resolves.toBe(
            'window-open'
        );
        expect(open).toHaveBeenCalled();
    });
});

describe('resolveCheckoutReturnUrl', () => {
    it('returns the web location on web', () => {
        expect(resolveCheckoutReturnUrl('https://app.example/room/1')).toBe(
            'https://app.example/room/1'
        );
    });

    it('returns the deep link inside the shells', () => {
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
        expect(resolveCheckoutReturnUrl('https://app.example/room/1')).toBe(
            NATIVE_CHECKOUT_RETURN_URL
        );
    });
});
