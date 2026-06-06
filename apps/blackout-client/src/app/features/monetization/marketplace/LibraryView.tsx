import { createElement, useCallback, useState, type ReactNode } from 'react';
import type { NormalizedEntitlement } from '@blackout/core';
import {
    fetchFulfillmentAsset,
    type FulfillmentAsset,
    type MarketplaceProviderSummary,
} from './marketplaceClient';
import { readBlackoutApiToken } from './useMarketplaceAuth';
import { ensureBlackoutApiToken } from '../../../../client/blackoutApiSession';
import { resolveMarketplaceProvider } from './providerMetadata';
import { ProductReviewsPanel } from './ProductReviewsPanel';

type FetchAssetFn = (entitlementId: string) => Promise<FulfillmentAsset>;

interface LibraryViewProps {
    entitlements: NormalizedEntitlement[];
    providers: MarketplaceProviderSummary[];
    /**
     * Injectable for tests; defaults to the authorized fulfillment call.
     * Resolves the API token lazily (awaiting the Matrix→API exchange if
     * it hasn't landed yet) so a freshly-restored session can still fetch.
     */
    fetchAsset?: FetchAssetFn;
}

async function defaultFetchAsset(entitlementId: string): Promise<FulfillmentAsset> {
    const token = readBlackoutApiToken() ?? (await ensureBlackoutApiToken());
    return fetchFulfillmentAsset(entitlementId, token);
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

type RowState =
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'ready'; asset: FulfillmentAsset }
    | { phase: 'error'; message: string };

const linkStyle = {
    color: 'var(--text-accent)',
    fontSize: 13,
    textDecoration: 'underline',
} as const;

const noteStyle = { margin: 0, fontSize: 12, color: 'var(--text-secondary)' } as const;

function formatExpiry(expiresAt: string): string | null {
    const ms = Date.parse(expiresAt);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toLocaleString();
}

function copyLicenseKey(key: string): void {
    // Best-effort; clipboard is unavailable in insecure contexts / tests.
    void navigator.clipboard?.writeText?.(key).catch(() => undefined);
}

function renderAssetDetail(asset: FulfillmentAsset): ReactNode {
    const details: ReactNode[] = [];

    if (asset.assetUrl) {
        details.push(
            createElement(
                'a',
                {
                    key: 'download',
                    href: asset.assetUrl,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    download: '',
                    style: linkStyle,
                },
                '⬇ Download'
            )
        );
        const expiry = formatExpiry(asset.expiresAt);
        if (expiry) {
            details.push(
                createElement('p', { key: 'expiry', style: noteStyle }, `Link expires ${expiry}.`)
            );
        }
    }

    if (asset.licenseKey) {
        details.push(
            createElement(
                'div',
                {
                    key: 'license',
                    style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
                },
                createElement(
                    'code',
                    {
                        style: {
                            fontSize: 12,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: 'var(--bg-input)',
                            color: 'var(--text-default)',
                            wordBreak: 'break-all',
                        },
                    },
                    asset.licenseKey
                ),
                createElement(
                    'button',
                    {
                        type: 'button',
                        onClick: () => copyLicenseKey(asset.licenseKey ?? ''),
                        style: {
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                        },
                    },
                    'Copy key'
                )
            )
        );
    }

    if (typeof asset.activationsMax === 'number') {
        details.push(
            createElement(
                'p',
                { key: 'activations', style: noteStyle },
                `Activations: ${asset.activationsUsed ?? 0}/${asset.activationsMax}`
            )
        );
    }

    if (details.length === 0) {
        details.push(
            createElement(
                'p',
                { key: 'auto', style: noteStyle },
                'Delivered automatically to your installed items.'
            )
        );
    }

    return createElement('div', { style: { display: 'grid', gap: 6, marginTop: 4 } }, ...details);
}

function LibraryEntitlementRow({
    entitlement,
    fetchAsset,
}: {
    entitlement: NormalizedEntitlement;
    fetchAsset: FetchAssetFn;
}): ReactNode {
    const [state, setState] = useState<RowState>({ phase: 'idle' });

    const retrieve = useCallback(async () => {
        setState({ phase: 'loading' });
        try {
            const asset = await fetchAsset(entitlement.id);
            setState({ phase: 'ready', asset });
        } catch (err) {
            console.warn('[marketplace] fulfillment retrieval failed', err);
            setState({ phase: 'error', message: 'Could not retrieve this item. Try again.' });
        }
    }, [entitlement.id, fetchAsset]);

    const header = createElement(
        'span',
        { style: { fontSize: 13 } },
        `${entitlement.kind} · ${entitlement.providerListingId} · ${entitlement.status}`
    );

    // Only `granted` entitlements are fulfillable; refunded/revoked/expired are
    // shown for history but offer no download.
    if (entitlement.status !== 'granted') {
        return createElement('li', { style: { display: 'grid', gap: 4 } }, header);
    }

    const action =
        state.phase === 'ready'
            ? renderAssetDetail(state.asset)
            : createElement(
                  'div',
                  { style: { display: 'grid', gap: 4 } },
                  createElement(
                      'button',
                      {
                          type: 'button',
                          disabled: state.phase === 'loading',
                          onClick: () => void retrieve(),
                          style: {
                              justifySelf: 'start',
                              fontSize: 12,
                              padding: '3px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--border-default)',
                              background: 'var(--bg-surface)',
                              color: 'var(--text-default)',
                              cursor: state.phase === 'loading' ? 'default' : 'pointer',
                          },
                      },
                      state.phase === 'loading'
                          ? 'Retrieving…'
                          : state.phase === 'error'
                          ? 'Retry'
                          : 'Get download'
                  ),
                  state.phase === 'error'
                      ? createElement(
                            'p',
                            { style: { ...noteStyle, color: 'var(--text-on-danger)' } },
                            state.message
                        )
                      : null
              );

    const reviews = createElement(ProductReviewsPanel, {
        providerId: entitlement.providerId,
        listingId: entitlement.providerListingId,
    });

    return createElement('li', { style: { display: 'grid', gap: 8 } }, header, action, reviews);
}

export function LibraryView({ entitlements, providers, fetchAsset }: LibraryViewProps): ReactNode {
    if (entitlements.length === 0) {
        return createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'You have no purchases yet. Browse listings to get started.'
        );
    }

    const resolvedFetchAsset = fetchAsset ?? defaultFetchAsset;
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
                    `${resolveMarketplaceProvider(providerId, providers).icon} ${
                        resolveMarketplaceProvider(providerId, providers).displayName
                    }`
                ),
                createElement(
                    'ul',
                    {
                        style: {
                            margin: 0,
                            paddingInlineStart: 16,
                            display: 'grid',
                            gap: 10,
                            listStyle: 'none',
                        },
                    },
                    ...items.map((entitlement) =>
                        createElement(LibraryEntitlementRow, {
                            key: entitlement.id,
                            entitlement,
                            fetchAsset: resolvedFetchAsset,
                        })
                    )
                )
            )
        )
    );
}
