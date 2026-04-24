// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceProviderSummary } from '../../../../src/app/features/monetization/marketplace/marketplaceClient';
import { ListingCard } from '../../../../src/app/features/monetization/marketplace/ListingCard';
import { resolveMarketplaceProvider } from '../../../../src/app/features/monetization/marketplace/providerMetadata';

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
});

const providers: MarketplaceProviderSummary[] = [
    {
        id: 'freeblackmarket',
        displayName: 'freeblackmarket',
        enabled: true,
        capabilities: ['catalog'],
        fees: { feeBps: 500, displayFeePercent: 5, payoutCadence: 'weekly' },
        presentation: {
            label: 'Free Black Market',
            icon: '🛡️',
            profileSlug: 'free-black-market',
            profileHeadline: 'Creator-first marketplace for vetted digital goods.',
        },
        trust: {
            tier: 'verified',
            verificationBadge: 'Verified Partner',
            trustSummary: 'Identity and payout controls are verified.',
            checkoutDisclosure: 'Checkout opens on Free Black Market in a secure browser session.',
            payoutPolicy: 'Weekly payouts after settlement.',
            refundPolicy: 'Refund support for non-delivery and duplicates.',
            supportPolicy: '24/7 support desk.',
        },
        profileUrl: '/marketplace/providers/free-black-market',
    },
];

describe('marketplace provider metadata', () => {
    it('falls back to humanized provider labels when metadata is missing', () => {
        const resolved = resolveMarketplaceProvider('mayhem-marketplaze', []);
        expect(resolved.displayName).toBe('Mayhem Marketplaze');
        expect(resolved.icon).toBe('🏬');
        expect(resolved.verificationBadge).toBeNull();
        expect(resolved.checkoutDisclosure).toContain('Mayhem Marketplaze');
    });

    it('renders verification and trust policy copy inside listing cards', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        mountedRoots.push(root);

        flushSync(() => {
            root.render(
                React.createElement(ListingCard, {
                listing: {
                    providerId: 'freeblackmarket',
                    providerListingId: 'sticker-pack-1',
                    category: 'emoji-sticker',
                    title: 'Sticker Pack',
                    description: 'Premium set',
                    priceCents: 499,
                    currency: 'usd',
                    sellerId: null,
                    mediaUrls: [],
                    entitlementKind: 'emoji_pack',
                },
                providers,
                onPurchase: vi.fn(),
                })
            );
        });

        expect(container.textContent).toContain('Verified Partner');
        expect(container.textContent).toContain('Weekly payouts after settlement.');
        expect(container.textContent).toContain('Refund support for non-delivery and duplicates.');
        const profileLink = container.querySelector('a');
        expect(profileLink?.getAttribute('href')).toBe('/marketplace/providers/free-black-market');
    });
});
