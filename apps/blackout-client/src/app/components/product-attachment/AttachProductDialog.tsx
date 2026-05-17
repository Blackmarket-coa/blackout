import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import FocusTrap from 'focus-trap-react';
import type { MarketplaceProviderId, NormalizedListing } from '@blackout/core';
import {
    fetchListings,
    fetchProviders,
    type MarketplaceProviderSummary,
} from '../../features/monetization/marketplace/marketplaceClient';
import { readBlackoutApiToken } from '../../features/monetization/marketplace/useMarketplaceAuth';
import { useDismissOnOutsideOrEscape } from '../../features/room/useDismissOnOutsideOrEscape';
import { stopPropagation } from '../../utils/keyboard';
import {
    PRODUCT_ATTACHMENTS_EVENT_TYPE,
    buildProductAttachmentsEvent,
    type ProductAttachmentRef,
    type ProductAttachmentsEventContent,
} from './productAttachmentSchema';

const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 50,
};

const dialogStyle: CSSProperties = {
    width: 'min(560px, 100%)',
    maxHeight: '80vh',
    background: 'var(--bg-surface, #0f172a)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 16,
    color: 'var(--text-primary, #f8fafc)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    overflow: 'hidden',
};

const inputStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    fontSize: 13,
};

const listStyle: CSSProperties = {
    overflow: 'auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const listingRowStyle = (selected: boolean): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${
        selected ? 'var(--accent-primary, #3b82f6)' : 'var(--border-default, #374151)'
    }`,
    background: selected ? 'var(--accent-primary-soft, #1e3a8a)' : 'var(--bg-input, #0f172a)',
    cursor: 'pointer',
});

const buttonRowStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
};

const primaryButtonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    cursor: 'pointer',
};

const buildRefFromListing = (listing: NormalizedListing): ProductAttachmentRef => ({
    providerId: listing.providerId as MarketplaceProviderId,
    listingId: listing.providerListingId,
    label: listing.title,
    priceCents: listing.priceCents,
    currency: listing.currency,
});

export interface AttachProductDialogProps {
    open: boolean;
    onClose: () => void;
    /**
     * Bound when the user confirms; receives both the parsed payload
     * and the canonical Matrix event type so the caller can emit the
     * event into the active room. PR 3 ships only the dialog; the
     * composer wiring that consumes this prop is deferred to a
     * follow-up PR (see plan §15 PR 3).
     */
    onAttach?: (event: {
        type: typeof PRODUCT_ATTACHMENTS_EVENT_TYPE;
        content: ProductAttachmentsEventContent;
    }) => void;
    /**
     * Optional initial selection; the dialog round-trips through this
     * so the host (Creator Listings, future composer) can pre-select
     * a listing and offer "edit attachment".
     */
    initialSelection?: ProductAttachmentRef[];
}

/**
 * Listing picker that produces a `co.bmc.product_attachments` event
 * payload. Renders the existing `marketplaceClient.fetchListings`
 * results so creators can pick from the same catalog the buyer side
 * sees. The dialog itself does not emit Matrix events — that's the
 * caller's job — keeping the component reusable for preview
 * surfaces (Creator Listings) and the eventual composer affordance.
 */
export const AttachProductDialog = ({
    open,
    onClose,
    onAttach,
    initialSelection = [],
}: AttachProductDialogProps): JSX.Element | null => {
    const [providers, setProviders] = useState<MarketplaceProviderSummary[]>([]);
    const [listings, setListings] = useState<NormalizedListing[]>([]);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Map<string, ProductAttachmentRef>>(() => {
        const map = new Map<string, ProductAttachmentRef>();
        for (const ref of initialSelection) {
            map.set(`${ref.providerId}:${ref.listingId}`, ref);
        }
        return map;
    });
    const [error, setError] = useState<string | null>(null);

    const token = useMemo(() => readBlackoutApiToken(), []);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        fetchProviders(token)
            .then((value) => {
                if (cancelled) return;
                setProviders(value);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'failed to load providers');
            });
        return () => {
            cancelled = true;
        };
    }, [open, token]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        fetchListings({ q: query.trim() || undefined }, token)
            .then((value) => {
                if (cancelled) return;
                setListings(value);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'failed to load listings');
            });
        return () => {
            cancelled = true;
        };
    }, [open, query, token]);

    useDismissOnOutsideOrEscape(open, null, onClose);

    if (!open) return null;

    const toggle = (listing: NormalizedListing) => {
        const key = `${listing.providerId}:${listing.providerListingId}`;
        const next = new Map(selected);
        if (next.has(key)) next.delete(key);
        else next.set(key, buildRefFromListing(listing));
        setSelected(next);
    };

    const handleAttach = () => {
        const refs = [...selected.values()];
        if (refs.length === 0) return;
        const content = buildProductAttachmentsEvent(refs);
        onAttach?.({ type: PRODUCT_ATTACHMENTS_EVENT_TYPE, content });
        onClose();
    };

    return (
        <FocusTrap
            focusTrapOptions={{
                onDeactivate: onClose,
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
                tabbableOptions: { displayCheck: 'none' },
            }}
        >
        <div role="dialog" aria-modal="true" aria-label="Attach product" style={overlayStyle}>
            <div style={dialogStyle} data-testid="attach-product-dialog">
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong style={{ fontSize: 16 }}>Attach product</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
                        {providers.length === 0 ? 'No providers' : `${providers.length} providers`}
                    </span>
                </header>
                <input
                    type="search"
                    placeholder="Search listings…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    style={inputStyle}
                />
                {error ? (
                    <p style={{ color: 'var(--text-danger, #f87171)', fontSize: 13, margin: 0 }}>
                        {error}
                    </p>
                ) : null}
                <div style={listStyle}>
                    {listings.length === 0 ? (
                        <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 13, margin: 0 }}>
                            No listings match.
                        </p>
                    ) : (
                        listings.map((listing) => {
                            const key = `${listing.providerId}:${listing.providerListingId}`;
                            const isSelected = selected.has(key);
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggle(listing)}
                                    style={listingRowStyle(isSelected)}
                                    aria-pressed={isSelected}
                                    data-testid="attach-product-row"
                                    data-listing-id={listing.providerListingId}
                                >
                                    <span
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 2,
                                        }}
                                    >
                                        <strong style={{ fontSize: 13 }}>{listing.title}</strong>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: 'var(--text-muted, #9ca3af)',
                                            }}
                                        >
                                            {listing.providerId} ·{' '}
                                            {(listing.priceCents / 100).toFixed(0)}{' '}
                                            {listing.currency}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 12 }}>{isSelected ? '✓' : ''}</span>
                                </button>
                            );
                        })
                    )}
                </div>
                <div style={buttonRowStyle}>
                    <button type="button" style={secondaryButtonStyle} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        style={primaryButtonStyle}
                        disabled={selected.size === 0}
                        onClick={handleAttach}
                        data-testid="attach-product-confirm"
                    >
                        Attach{selected.size > 0 ? ` (${selected.size})` : ''}
                    </button>
                </div>
            </div>
        </div>
        </FocusTrap>
    );
};

export default AttachProductDialog;
