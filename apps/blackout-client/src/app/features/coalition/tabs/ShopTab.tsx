import React, { useMemo } from 'react';
import type { CoalitionFeedItem } from '@blackout/core';
import { useCoalitionFeed, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { buildCommunitiesPath } from '../../../pages/paths';

export interface ShopTabProps {
    scope: CoalitionScopeQuery;
}

export function ShopTab({ scope }: ShopTabProps) {
    const { data, loading, error } = useCoalitionFeed(scope, { kind: 'listing', limit: 30 });
    const listings = useMemo<CoalitionFeedItem[]>(() => data?.items ?? [], [data]);

    if (loading && listings.length === 0) {
        return <div style={{ padding: 24 }}>Loading shop...</div>;
    }
    if (error) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }

    return (
        <div style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <strong>Coalition Shop</strong>
                <small style={{ color: 'var(--text-secondary)' }}>
                    {listings.length} listing{listings.length === 1 ? '' : 's'}
                </small>
            </header>
            {listings.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>
                    No listings in scope yet. Check back soon, or post one from any vendor den.
                </div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 12,
                    }}
                >
                    {listings.map((listing) => (
                        <article
                            key={listing.id}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                background: 'var(--bg-input)',
                                overflow: 'hidden',
                                display: 'grid',
                            }}
                        >
                            <div
                                style={{
                                    aspectRatio: '4 / 3',
                                    background: listing.mediaUrl
                                        ? `url(${listing.mediaUrl}) center/cover`
                                        : 'linear-gradient(135deg, #16813d22, #1ABC9C22)',
                                }}
                            />
                            <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                                <strong style={{ fontSize: 14 }}>{listing.title}</strong>
                                {listing.body ? (
                                    <small style={{ color: 'var(--text-secondary)' }}>
                                        {listing.body}
                                    </small>
                                ) : null}
                                {listing.denId ? (
                                    <a
                                        href={buildCommunitiesPath(null, listing.denId)}
                                        data-testid={`coalition-shop-view-${listing.id}`}
                                        style={{
                                            marginTop: 4,
                                            border: '1px solid var(--accent-primary, #1ABC9C)',
                                            background: 'transparent',
                                            color: 'var(--accent-primary, #1ABC9C)',
                                            borderRadius: 8,
                                            padding: '6px 10px',
                                            cursor: 'pointer',
                                            textDecoration: 'none',
                                            textAlign: 'center',
                                            fontSize: 13,
                                        }}
                                    >
                                        Open den →
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        data-testid={`coalition-shop-view-${listing.id}`}
                                        onClick={() => {
                                            const url = `${window.location.origin}/coalition/listing/${encodeURIComponent(listing.id)}`;
                                            if (navigator.clipboard) {
                                                void navigator.clipboard.writeText(url);
                                            }
                                        }}
                                        style={{
                                            marginTop: 4,
                                            border: '1px solid var(--accent-primary, #1ABC9C)',
                                            background: 'transparent',
                                            color: 'var(--accent-primary, #1ABC9C)',
                                            borderRadius: 8,
                                            padding: '6px 10px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Copy listing link
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ShopTab;
