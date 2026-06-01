import { createElement, type ReactNode } from 'react';
import { categoryLabel, type NormalizedListing } from '@blackout/core';
import type { MarketplaceProviderSummary } from './marketplaceClient';
import { resolveMarketplaceProvider } from './providerMetadata';

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
}

export function ListingCard({
    listing,
    providers,
    onPurchase,
    onMessageVendor,
    purchasing,
    alreadyOwned,
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
        createElement('h3', { style: { margin: 0, fontSize: 16 } }, listing.title),
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
            createElement(
                'button',
                {
                    type: 'button',
                    onClick: () => onPurchase(listing),
                    disabled: Boolean(purchasing) || Boolean(alreadyOwned),
                    style: {
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-default)',
                        background: alreadyOwned ? 'var(--bg-input)' : 'var(--bg-accent)',
                        color: alreadyOwned ? 'var(--text-secondary)' : 'var(--text-on-accent)',
                        cursor: alreadyOwned || purchasing ? 'default' : 'pointer',
                    },
                },
                alreadyOwned ? 'Owned' : purchasing ? 'Opening checkout…' : 'Purchase'
            ),
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
