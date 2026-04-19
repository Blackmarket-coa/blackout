import { createElement, type ReactNode } from 'react';
import type { NormalizedEntitlement } from '@blackout/core';
import type { MarketplaceProviderSummary } from './marketplaceClient';

interface LibraryViewProps {
    entitlements: NormalizedEntitlement[];
    providers: MarketplaceProviderSummary[];
}

function providerDisplayName(
    providerId: string,
    providers: MarketplaceProviderSummary[]
): string {
    const match = providers.find((provider) => provider.id === providerId);
    return match?.displayName ?? providerId;
}

function groupByProvider(
    entitlements: NormalizedEntitlement[]
): Record<string, NormalizedEntitlement[]> {
    const groups: Record<string, NormalizedEntitlement[]> = {};
    for (const entitlement of entitlements) {
        const key = entitlement.providerId;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entitlement);
    }
    return groups;
}

export function LibraryView({ entitlements, providers }: LibraryViewProps): ReactNode {
    if (entitlements.length === 0) {
        return createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'You have no purchases yet. Browse listings to get started.'
        );
    }

    const groups = groupByProvider(entitlements);
    return createElement(
        'div',
        { style: { display: 'grid', gap: 12 } },
        ...Object.entries(groups).map(([providerId, items]) =>
            createElement(
                'section',
                {
                    key: providerId,
                    style: {
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: 12,
                        display: 'grid',
                        gap: 8,
                    },
                },
                createElement(
                    'h4',
                    { style: { margin: 0, fontSize: 14 } },
                    providerDisplayName(providerId, providers)
                ),
                createElement(
                    'ul',
                    { style: { margin: 0, paddingInlineStart: 16, display: 'grid', gap: 4 } },
                    ...items.map((entitlement) =>
                        createElement(
                            'li',
                            { key: entitlement.id, style: { fontSize: 13 } },
                            `${entitlement.kind} · ${entitlement.providerListingId} · ${entitlement.status}`
                        )
                    )
                )
            )
        )
    );
}
