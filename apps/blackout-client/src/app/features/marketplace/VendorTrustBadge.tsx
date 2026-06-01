import { createElement, type ReactNode } from 'react';
import type { Room } from 'matrix-js-sdk';
import {
    FBM_VENDOR_METADATA_EVENT_TYPE,
    FBM_VENDOR_TRUST_EVENT_TYPE,
    isFbmVendorMetadataContent,
    isFbmVendorTrustContent,
    type FbmVendorTrustContent,
    type FbmVendorTrustTier,
} from '@blackout/protocol';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';

interface TierPresentation {
    label: string;
    icon: string;
    background: string;
    color: string;
}

const TIER_PRESENTATION: Record<FbmVendorTrustTier, TierPresentation> = {
    trusted: {
        label: 'Trusted vendor',
        icon: '★',
        background: 'var(--bg-success, #1f4d2b)',
        color: 'var(--text-on-success, #d6ffe0)',
    },
    verified: {
        label: 'Verified vendor',
        icon: '✓',
        background: 'var(--bg-accent, #2b3a55)',
        color: 'var(--text-on-accent, #dce8ff)',
    },
    unverified: {
        label: 'Unverified vendor',
        icon: '○',
        background: 'var(--bg-input, #2a2a2a)',
        color: 'var(--text-secondary, #9aa0a6)',
    },
    flagged: {
        label: 'Flagged vendor',
        icon: '⚠',
        background: 'var(--bg-danger, #5a1f1f)',
        color: 'var(--text-on-danger, #ffd6d6)',
    },
};

function formatRate(rate: number | undefined): string | null {
    if (typeof rate !== 'number' || Number.isNaN(rate)) return null;
    return `${Math.round(rate * 100)}%`;
}

/**
 * Pure presentational badge for a resolved vendor-trust content block. Split out
 * from the room-wired wrapper so it can be unit-tested without a Matrix room.
 */
export function VendorTrustBadgeView({ trust }: { trust: FbmVendorTrustContent }): ReactNode {
    const tier = TIER_PRESENTATION[trust.tier] ?? TIER_PRESENTATION.unverified;
    const completion = formatRate(trust.completionRate);
    const dispute = formatRate(trust.disputeRate);
    const titleParts = [tier.label];
    if (completion) titleParts.push(`${completion} completion`);
    if (dispute) titleParts.push(`${dispute} disputes`);
    if (trust.coopStatus) titleParts.push(trust.coopStatus);

    return createElement(
        'span',
        {
            title: titleParts.join(' · '),
            style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.6,
                background: tier.background,
                color: tier.color,
                width: 'fit-content',
            },
        },
        `${tier.icon} ${tier.label}`
    );
}

/**
 * Reads a vendor's trust badge from room state. The trust event (§2.2) is keyed
 * by `vendorId`, which a client can't derive from a room alone, so we first read
 * the `co.bmc.vendor.metadata` event (empty state key) that binds room ->
 * vendorId, then read the trust event keyed by that vendorId. Renders nothing
 * for non-vendor rooms or when no trust has been published.
 */
export function VendorTrustBadge({ room }: { room: Room }): ReactNode {
    const metaEvent = useStateEvent(room, FBM_VENDOR_METADATA_EVENT_TYPE as StateEvent, '');
    const metaContent = metaEvent?.getContent();
    const vendorId =
        metaContent && isFbmVendorMetadataContent(metaContent) ? metaContent.vendorId : '';

    // Hook order is stable: when vendorId is '' the trust read uses an empty
    // state key, which never matches the vendor-keyed trust event -> undefined.
    const trustEvent = useStateEvent(room, FBM_VENDOR_TRUST_EVENT_TYPE as StateEvent, vendorId);
    const trustContent = trustEvent?.getContent();
    if (!vendorId || !trustContent || !isFbmVendorTrustContent(trustContent)) return null;

    return createElement(VendorTrustBadgeView, { trust: trustContent });
}
