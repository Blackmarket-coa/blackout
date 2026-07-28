import { createElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { categoryLabel, type NormalizedListing } from '@blackout/core';
import type { MarketplaceProviderSummary } from './marketplaceClient';
import { resolveMarketplaceProvider } from './providerMetadata';
import { PaywallCta, resolvePaywallState } from '../components/PaywallCta';

/** Human label for a `features.*` key, e.g. `features.hardening.torTransport` → "Tor transport". */
function featureKeyLabel(key: string): string {
    const leaf = key.split('.').pop() ?? key;
    const spaced = leaf.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const cardStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 12,
    background: 'var(--bg-surface)',
    display: 'grid',
    gap: 8,
};

const providerBadgeStyle: Record<string, string | number> = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    fontSize: 11,
};

const priceStyle: Record<string, string | number> = {
    fontSize: 18,
    fontWeight: 600,
};

function formatPrice(priceCents: number, currency: string): string {
    const major = (priceCents / 100).toFixed(2);
    return `${major} ${currency.toUpperCase()}`;
}

interface ListingCardProps {
    listing: NormalizedListing;
    providers: MarketplaceProviderSummary[];
    onPurchase: (listing: NormalizedListing) => void;
    onMessageVendor?: (listing: NormalizedListing) => void;
    purchasing?: boolean;
    alreadyOwned?: boolean;
    /**
     * True when the caller already holds every `features.*` key this listing
     * grants via their current plan/tier (or beta-unlock) — the CTA collapses
     * to "Included in your access" instead of a charge.
     */
    includedInAccess?: boolean;
    /** When set, the listing title links through to this detail route. */
    detailPath?: string;
}

export function ListingCard({
    listing,
    providers,
    onPurchase,
    onMessageVendor,
    purchasing,
    alreadyOwned,
    includedInAccess,
    detailPath,
}: ListingCardProps): ReactNode {
    const provider = resolveMarketplaceProvider(listing.providerId, providers);

    return createElement(
        'article',
        { style: cardStyle },
        createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            createElement(
                'span',
                { style: providerBadgeStyle },
                `${provider.icon} ${provider.displayName}`,
                provider.verificationBadge
                    ? createElement(
                          'strong',
                          {
                              style: {
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.4,
                              },
                          },
                          provider.verificationBadge
                      )
                    : null
            ),
            createElement(
                'span',
                { style: { fontSize: 11, color: 'var(--text-secondary)' } },
                categoryLabel(listing.category)
            )
        ),
        createElement(
            'h3',
            { style: { margin: 0, fontSize: 16 } },
            detailPath
                ? createElement(
                      Link,
                      {
                          to: detailPath,
                          style: { color: 'inherit' },
                          'data-testid': 'listing-card-detail-link',
                      } as never,
                      listing.title
                  )
                : listing.title
        ),
        createElement(
            'p',
            { style: { margin: 0, fontSize: 13, color: 'var(--text-secondary)' } },
            listing.description
        ),
        createElement(
            'p',
            { style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)' } },
            provider.trustSummary
        ),
        createElement(
            'p',
            { style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)' } },
            `Payouts: ${provider.payoutPolicy} Refunds: ${provider.refundPolicy}`
        ),
        createElement(
            'p',
            { style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)' } },
            `Support: ${provider.supportPolicy}`
        ),
        createElement(
            'div',
            { style: priceStyle },
            formatPrice(listing.priceCents, listing.currency)
        ),
        listing.featureKeys && listing.featureKeys.length > 0
            ? createElement(
                  'p',
                  {
                      style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)' },
                      'data-testid': 'listing-card-feature-keys',
                  },
                  `Unlocks: ${listing.featureKeys.map(featureKeyLabel).join(', ')}`
              )
            : null,
        createElement(
            'a',
            {
                href: provider.profileUrl,
                target: '_blank',
                rel: 'noreferrer',
                style: { color: 'var(--text-link)', fontSize: 12 },
            },
            `View ${provider.displayName} profile`
        ),
        createElement(
            'p',
            { style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)' } },
            provider.checkoutDisclosure
        ),
        createElement(
            'div',
            { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            createElement(PaywallCta, {
                state: resolvePaywallState({
                    owned: Boolean(alreadyOwned),
                    includedInAccess: Boolean(includedInAccess),
                }),
                priceLabel: formatPrice(listing.priceCents, listing.currency),
                onPurchase: () => onPurchase(listing),
                busy: Boolean(purchasing),
                actionLabel:
                    listing.entitlementKind === 'subscription_tier' ? 'Subscribe' : 'Purchase',
                'data-testid': 'listing-card-cta',
            }),
            // Encrypted-DM entrypoint (§2.1). Only offered when the parent can
            // resolve the seller and the listing carries a vendor id.
            onMessageVendor && listing.sellerId
                ? createElement(
                      'button',
                      {
                          type: 'button',
                          onClick: () => onMessageVendor(listing),
                          style: {
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border-default)',
                              background: 'var(--bg-surface)',
                              color: 'var(--text-default)',
                              cursor: 'pointer',
                          },
                      },
                      '💬 Message vendor'
                  )
                : null
        )
    );
}
