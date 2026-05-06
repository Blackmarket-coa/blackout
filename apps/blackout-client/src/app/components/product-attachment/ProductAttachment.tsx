import { useEffect, useState, type CSSProperties } from 'react';
import type { MarketplaceProviderId, NormalizedListing } from '@blackout/core';
import {
    fetchListingDetail,
    startCheckout,
} from '../../features/monetization/marketplace/marketplaceClient';
import { readBlackoutApiToken } from '../../features/monetization/marketplace/useMarketplaceAuth';
import { EmbeddedCheckoutOverlay } from '../../features/monetization/marketplace/EmbeddedCheckoutOverlay';
import {
    parseProductAttachmentsEvent,
    type ProductAttachmentRef,
    type ProductAttachmentsEventContent,
} from './productAttachmentSchema';

const stripStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 0',
};

const cardStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '10px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
};

const cardBodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
};

const titleStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const subtitleStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const buttonStyle: CSSProperties = {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
};

const formatPrice = (priceCents?: number, currency?: string): string | null => {
    if (typeof priceCents !== 'number' || !currency) return null;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(priceCents / 100);
    } catch {
        return `${(priceCents / 100).toFixed(2)} ${currency}`;
    }
};

interface ProductAttachmentCardProps {
    ref_: ProductAttachmentRef;
    onCheckoutStart: (
        ref: ProductAttachmentRef
    ) => Promise<{ redirectUrl: string; sessionId: string; embed?: boolean } | null>;
}

const ProductAttachmentCard = ({
    ref_,
    onCheckoutStart,
}: ProductAttachmentCardProps): JSX.Element => {
    const [listing, setListing] = useState<NormalizedListing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const token = readBlackoutApiToken();
        fetchListingDetail(ref_.providerId as MarketplaceProviderId, ref_.listingId, token)
            .then((value) => {
                if (cancelled) return;
                setListing(value);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'failed to load listing');
            });
        return () => {
            cancelled = true;
        };
    }, [ref_.listingId, ref_.providerId]);

    const title = listing?.title ?? ref_.label ?? `${ref_.providerId}:${ref_.listingId}`;
    const price =
        formatPrice(listing?.priceCents, listing?.currency) ??
        formatPrice(ref_.priceCents, ref_.currency) ??
        '';

    const handleClick = async () => {
        setBusy(true);
        try {
            await onCheckoutStart(ref_);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={cardStyle}
            data-testid="product-attachment-card"
            data-listing-id={ref_.listingId}
            data-provider-id={ref_.providerId}
        >
            <div style={cardBodyStyle}>
                <span style={titleStyle}>{title}</span>
                <span style={subtitleStyle}>
                    {error
                        ? 'Listing unavailable.'
                        : listing
                        ? `${ref_.providerId}${price ? ` · ${price}` : ''}`
                        : 'Loading listing…'}
                </span>
            </div>
            <button
                type="button"
                style={buttonStyle}
                onClick={handleClick}
                disabled={busy || !!error}
            >
                {busy ? 'Starting…' : 'Buy'}
            </button>
        </div>
    );
};

export interface ProductAttachmentProps {
    /** Raw Matrix event content; passed straight from the timeline event. */
    eventContent: unknown;
    /** Optional pre-parsed payload, used by the AttachProductDialog preview. */
    parsed?: ProductAttachmentsEventContent;
}

/**
 * Renders one or more `co.bmc.product_attachments` references as
 * inline cards. Each card resolves the live listing via the existing
 * `marketplaceClient.fetchListingDetail` so price / title stay
 * up-to-date, and clicking "Buy" hands off to the existing
 * `EmbeddedCheckoutOverlay` — no parallel checkout pipeline.
 */
export const ProductAttachment = ({
    eventContent,
    parsed,
}: ProductAttachmentProps): JSX.Element | null => {
    const payload = parsed ?? parseProductAttachmentsEvent(eventContent);
    const [activeCheckout, setActiveCheckout] = useState<{
        redirectUrl: string;
        sessionId: string;
    } | null>(null);

    if (payload.listings.length === 0) return null;

    const onCheckoutStart = async (ref: ProductAttachmentRef) => {
        const token = readBlackoutApiToken();
        try {
            const result = await startCheckout(
                {
                    providerId: ref.providerId as MarketplaceProviderId,
                    listingId: ref.listingId,
                    sku: ref.sku,
                    returnUrl: window.location.href,
                    embed: true,
                },
                token
            );
            if (result.embed) {
                setActiveCheckout({ redirectUrl: result.redirectUrl, sessionId: result.sessionId });
            } else {
                window.open(result.redirectUrl, '_blank', 'noopener,noreferrer');
            }
            return result;
        } catch (err) {
            console.warn('[product-attachment] checkout failed', err);
            return null;
        }
    };

    return (
        <div
            style={stripStyle}
            data-testid="product-attachment-strip"
            data-attachment-count={payload.listings.length}
        >
            {payload.listings.map((ref) => (
                <ProductAttachmentCard
                    key={`${ref.providerId}:${ref.listingId}:${ref.sku ?? ''}`}
                    ref_={ref}
                    onCheckoutStart={onCheckoutStart}
                />
            ))}
            {activeCheckout ? (
                <EmbeddedCheckoutOverlay
                    redirectUrl={activeCheckout.redirectUrl}
                    sessionId={activeCheckout.sessionId}
                    onCompleted={() => setActiveCheckout(null)}
                    onCancelled={() => setActiveCheckout(null)}
                    onError={() => setActiveCheckout(null)}
                />
            ) : null}
        </div>
    );
};

export default ProductAttachment;
