import { useEffect, useState } from 'react';
import {
    getExternalPurchasePolicy,
    resolveExternalPurchasePolicy,
    type ExternalPurchasePolicy,
} from '../../platform/external-purchase';

/**
 * Synchronous default so web/desktop render their purchase CTAs on first
 * paint exactly as before — only the native shells need the async device
 * region probe, and they start from the fail-closed `blocked` state until
 * it resolves.
 */
const WEB_DEFAULT = resolveExternalPurchasePolicy({ platform: null, region: null });

/**
 * Resolve the platform/storefront purchase policy for the current runtime.
 *
 * Every purchase CTA (marketplace listings, product attachments, creator
 * subscriptions) consults this before rendering a buy button, so the
 * iOS-outside-US case hides the CTA entirely instead of dead-ending the
 * user at a checkout Apple's rules won't let us open.
 */
export const useExternalPurchasePolicy = (): ExternalPurchasePolicy => {
    const [policy, setPolicy] = useState<ExternalPurchasePolicy>(() => {
        if (typeof window === 'undefined') return WEB_DEFAULT;
        const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
            .Capacitor;
        if (!cap?.isNativePlatform?.()) return WEB_DEFAULT;
        return { allowed: false, mode: 'blocked', reason: 'ios-storefront-not-us' };
    });

    useEffect(() => {
        let cancelled = false;
        getExternalPurchasePolicy().then((resolved) => {
            if (!cancelled) setPolicy(resolved);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return policy;
};
