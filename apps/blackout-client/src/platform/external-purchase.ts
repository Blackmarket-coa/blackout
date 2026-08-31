import { isNativePlatform } from './nativeMediaBridge';

/**
 * External purchase policy for the native shells.
 *
 * Apple's no-entitlement external purchase link rule (US v. Epic injunction,
 * May 2025) lets iOS apps link out to web checkout WITHOUT the
 * StoreKit External Purchase Link entitlement — but only on the US App Store
 * storefront. Outside the US the app must not surface the link until the
 * EU/other-region entitlement addendum ships. Android checkout for
 * marketplace (physical/creator) goods runs through the external browser so
 * the flow stays outside Play Billing ambiguity. On the plain web (and the
 * desktop shell) nothing changes: the embedded overlay remains the default.
 *
 * Storefront detection: we approximate the App Store storefront with the
 * device region (Capacitor Device plugin language tag, falling back to
 * `navigator.language`). That is the documented v1 tradeoff — a real
 * StoreKit `Storefront` lookup needs a native plugin call and can replace
 * `resolveDeviceRegion()` without touching any call site. Unknown region on
 * iOS fails CLOSED (link hidden).
 */

export type NativePlatform = 'ios' | 'android';

export type ExternalPurchaseMode = 'embedded' | 'external-browser' | 'blocked';

export type ExternalPurchasePolicy = {
    /** Whether any purchase CTA may be shown at all. */
    allowed: boolean;
    /** How an allowed checkout must be presented. */
    mode: ExternalPurchaseMode;
    reason:
        | 'web-platform'
        | 'android-external-checkout'
        | 'ios-us-storefront-link-out'
        | 'ios-storefront-not-us';
};

type CapacitorDevicePlugin = {
    getLanguageTag?: () => Promise<{ value?: string }>;
};

type CapacitorBrowserPlugin = {
    open?: (options: {
        url: string;
        presentationStyle?: 'fullscreen' | 'popover';
    }) => Promise<unknown>;
};

type CapacitorGlobal = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: {
        Device?: CapacitorDevicePlugin;
        Browser?: CapacitorBrowserPlugin;
    };
};

const getCapacitor = (): CapacitorGlobal | undefined => {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
};

/**
 * `'ios' | 'android'` inside the Capacitor shells, `null` on web/desktop
 * (and when the injected bridge reports an unexpected platform).
 */
export function detectNativePlatform(): NativePlatform | null {
    if (!isNativePlatform()) return null;
    const platform = getCapacitor()?.getPlatform?.();
    return platform === 'ios' || platform === 'android' ? platform : null;
}

/**
 * ISO 3166-1 alpha-2 region from a BCP-47 language tag ("en-US" → "US").
 * Tolerates underscore separators ("en_US") and returns `null` for tags
 * that carry no region.
 */
export function regionFromLanguageTag(tag: string | null | undefined): string | null {
    if (!tag) return null;
    const normalized = tag.trim().replace(/_/g, '-');
    if (!normalized) return null;
    try {
        const region = new Intl.Locale(normalized).region;
        if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    } catch {
        // Fall through to the manual parse below.
    }
    const match = /^[A-Za-z]{2,3}-([A-Za-z]{2})(?:-|$)/.exec(normalized);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Device region via the Capacitor Device plugin when the shell registered
 * it, otherwise the webview's `navigator.language`. `null` when neither
 * yields a region (callers treat that as fail-closed on iOS).
 */
export async function resolveDeviceRegion(): Promise<string | null> {
    const device = getCapacitor()?.Plugins?.Device;
    if (device?.getLanguageTag) {
        try {
            const { value } = await device.getLanguageTag();
            const region = regionFromLanguageTag(value);
            if (region) return region;
        } catch {
            // Plugin present but call failed — fall back to navigator.
        }
    }
    if (typeof navigator !== 'undefined') {
        return regionFromLanguageTag(navigator.language);
    }
    return null;
}

/**
 * Pure policy resolution — unit-tested platform × region matrix. Keep this
 * free of environment reads so the shells and the client agree on one
 * decision table.
 */
export function resolveExternalPurchasePolicy(input: {
    platform: NativePlatform | null;
    region: string | null;
}): ExternalPurchasePolicy {
    const { platform, region } = input;
    if (platform === null) {
        return { allowed: true, mode: 'embedded', reason: 'web-platform' };
    }
    if (platform === 'android') {
        return { allowed: true, mode: 'external-browser', reason: 'android-external-checkout' };
    }
    if (region === 'US') {
        return { allowed: true, mode: 'external-browser', reason: 'ios-us-storefront-link-out' };
    }
    return { allowed: false, mode: 'blocked', reason: 'ios-storefront-not-us' };
}

/** Detect platform + region and resolve the policy in one call. */
export async function getExternalPurchasePolicy(): Promise<ExternalPurchasePolicy> {
    const platform = detectNativePlatform();
    const region = platform === 'ios' ? await resolveDeviceRegion() : null;
    return resolveExternalPurchasePolicy({ platform, region });
}

export type ExternalOpenOutcome = 'capacitor-browser' | 'window-open' | 'failed';

const isOpenableCheckoutUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:') return true;
        // Allow plain http only against local dev checkouts.
        return (
            parsed.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
        );
    } catch {
        return false;
    }
};

/**
 * Open an external checkout URL with the most appropriate transport:
 * `@capacitor/browser` inside the shells (SFSafariViewController /
 * Chrome Custom Tabs, which keep their own persistent cookie jar so the
 * web checkout session and cart survive repeat opens), `window.open`
 * everywhere else.
 */
export async function openExternalCheckoutUrl(url: string): Promise<ExternalOpenOutcome> {
    if (!isOpenableCheckoutUrl(url)) return 'failed';

    if (isNativePlatform()) {
        const browser = getCapacitor()?.Plugins?.Browser;
        if (browser?.open) {
            try {
                await browser.open({ url, presentationStyle: 'fullscreen' });
                return 'capacitor-browser';
            } catch {
                // Plugin failed — fall through to window.open below.
            }
        }
    }

    if (typeof window !== 'undefined') {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (opened) return 'window-open';
    }
    return 'failed';
}

/**
 * Deep link Safari/Custom Tabs bounce back to after an external checkout.
 * `mobile-bootstrap.ts` already routes `blackout://` URLs through the
 * native bridge, and a resume triggers `resume_sync`, which refreshes
 * entitlements — no dedicated return handler is needed.
 */
export const NATIVE_CHECKOUT_RETURN_URL = 'blackout://checkout/return';

/**
 * Return URL for `startCheckout`: the current page on web (so the provider
 * can bounce straight back), the `blackout://` deep link inside the shells
 * (where the page origin is the local Capacitor server and unreachable
 * from the external browser).
 */
export function resolveCheckoutReturnUrl(webLocationHref: string): string {
    return isNativePlatform() ? NATIVE_CHECKOUT_RETURN_URL : webLocationHref;
}
