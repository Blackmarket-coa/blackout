import type { MarketplaceProviderId } from './provider';

export type MarketplaceTrustTier = 'verified' | 'community' | 'unverified';

export interface MarketplaceProviderTrustMetadata {
    tier: MarketplaceTrustTier;
    verificationBadge: string | null;
    trustSummary: string;
    checkoutDisclosure: string;
    payoutPolicy: string;
    refundPolicy: string;
    supportPolicy: string;
}

export interface MarketplaceProviderPresentation {
    providerId: MarketplaceProviderId;
    label: string;
    icon: string;
    profileSlug: string;
    profileHeadline: string;
    trust: MarketplaceProviderTrustMetadata;
}

const providerPresentationMap: Record<MarketplaceProviderId, MarketplaceProviderPresentation> = {
    freeblackmarket: {
        providerId: 'freeblackmarket',
        label: 'Free Black Market',
        icon: '🛡️',
        profileSlug: 'free-black-market',
        profileHeadline: 'Creator-first marketplace for vetted digital goods.',
        trust: {
            tier: 'verified',
            verificationBadge: 'Verified Partner',
            trustSummary: 'Identity, payout account, and webhook integrity are continuously verified.',
            checkoutDisclosure: 'Checkout opens on Free Black Market in a secure browser session.',
            payoutPolicy: 'Creator payouts are issued weekly after settlement and fraud review windows.',
            refundPolicy: 'Refunds are supported for undelivered items and accidental duplicate purchases.',
            supportPolicy: '24/7 support via provider help desk with escalation for entitlement issues.',
        },
    },
    blamazon: {
        providerId: 'blamazon',
        label: 'Blamazon',
        icon: '📦',
        profileSlug: 'blamazon',
        profileHeadline: 'General catalog partner for curated digital bundles.',
        trust: {
            tier: 'community',
            verificationBadge: 'Community Reviewed',
            trustSummary: 'Provider is monitored for fulfillment reliability and policy transparency.',
            checkoutDisclosure: 'Checkout opens on Blamazon with provider-managed payment terms.',
            payoutPolicy: 'Payout cadence depends on creator tier and settlement risk profile.',
            refundPolicy: 'Refund requests are handled through provider policy and reviewed case-by-case.',
            supportPolicy: 'Support is available through provider ticketing with SLA-based responses.',
        },
    },
    'mayhem-marketplaze': {
        providerId: 'mayhem-marketplaze',
        label: 'Mayhem Marketplaze',
        icon: '⚡',
        profileSlug: 'mayhem-marketplaze',
        profileHeadline: 'Experimental storefront for high-velocity drop campaigns.',
        trust: {
            tier: 'community',
            verificationBadge: 'Community Reviewed',
            trustSummary: 'Commerce safeguards are monitored while this provider scales operations.',
            checkoutDisclosure: 'Checkout opens on Mayhem Marketplaze under provider checkout controls.',
            payoutPolicy: 'Payouts are batched monthly while creator verification remains active.',
            refundPolicy: 'Refund windows vary by listing and are disclosed before payment.',
            supportPolicy: 'Support channels include in-marketplace chat and asynchronous ticket follow-up.',
        },
    },
    'antin-amazon': {
        providerId: 'antin-amazon',
        label: 'Antin Amazon',
        icon: '🌿',
        profileSlug: 'antin-amazon',
        profileHeadline: 'Co-op aligned marketplace with sustainability-focused creators.',
        trust: {
            tier: 'community',
            verificationBadge: 'Community Reviewed',
            trustSummary: 'Provider governance and dispute handling are reviewed for buyer safety.',
            checkoutDisclosure: 'Checkout opens on Antin Amazon with cooperative billing controls.',
            payoutPolicy: 'Payouts are distributed weekly after cooperative treasury reconciliation.',
            refundPolicy: 'Refunds prioritize misrepresentation, fraud, and non-delivery claims.',
            supportPolicy: 'Support includes creator mediation and buyer protection guidance.',
        },
    },
};

function titleCaseProviderId(providerId: string): string {
    return providerId
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((segment) => segment[0].toUpperCase() + segment.slice(1))
        .join(' ');
}

export function getMarketplaceProviderPresentation(
    providerId: MarketplaceProviderId,
    fallbackDisplayName?: string
): MarketplaceProviderPresentation {
    const mapped = providerPresentationMap[providerId];
    if (mapped) return mapped;
    const label = fallbackDisplayName?.trim() || titleCaseProviderId(providerId);
    return {
        providerId,
        label,
        icon: '🏬',
        profileSlug: providerId,
        profileHeadline: 'Marketplace provider profile information is being prepared.',
        trust: {
            tier: 'unverified',
            verificationBadge: null,
            trustSummary: 'Provider identity is not yet fully verified in this environment.',
            checkoutDisclosure: `Checkout opens on ${label}; review provider policies before purchase.`,
            payoutPolicy: 'Payout schedule is disclosed directly by the provider during onboarding.',
            refundPolicy: 'Refund policy is managed by the provider and may vary by listing.',
            supportPolicy: 'Use provider support contacts shown in checkout for urgent assistance.',
        },
    };
}
