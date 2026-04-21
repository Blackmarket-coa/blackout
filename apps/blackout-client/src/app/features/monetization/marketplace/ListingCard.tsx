import { createElement, type ReactNode } from 'react';
import type { NormalizedListing } from '@blackout/core';
import type { MarketplaceProviderSummary } from './marketplaceClient';

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
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
};

const priceStyle: Record<string, string | number> = {
    fontSize: 18,
    fontWeight: 600,
};

function formatPrice(priceCents: number, currency: string): string {
    const major = (priceCents / 100).toFixed(2);
    return `${major} ${currency.toUpperCase()}`;
}

function providerDisplayName(
    providerId: string,
    providers: MarketplaceProviderSummary[]
): string {
    const match = providers.find((provider) => provider.id === providerId);
    return match?.displayName ?? providerId;
}

interface ListingCardProps {
    listing: NormalizedListing;
    providers: MarketplaceProviderSummary[];
    onPurchase: (listing: NormalizedListing) => void;
    purchasing?: boolean;
    alreadyOwned?: boolean;
}

export function ListingCard({
    listing,
    providers,
    onPurchase,
    purchasing,
    alreadyOwned,
}: ListingCardProps): ReactNode {
    return createElement(
        'article',
        { style: cardStyle },
        createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            createElement('span', { style: providerBadgeStyle }, providerDisplayName(listing.providerId, providers)),
            createElement(
                'span',
                { style: { fontSize: 11, color: 'var(--text-secondary)' } },
                listing.category
            )
        ),
        createElement('h3', { style: { margin: 0, fontSize: 16 } }, listing.title),
        createElement(
            'p',
            { style: { margin: 0, fontSize: 13, color: 'var(--text-secondary)' } },
            listing.description
        ),
        createElement('div', { style: priceStyle }, formatPrice(listing.priceCents, listing.currency)),
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
        )
    );
}
