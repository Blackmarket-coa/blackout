import type { MarketplaceProviderSummary } from './marketplaceClient';

export interface ResolvedMarketplaceProvider {
    id: string;
    displayName: string;
    icon: string;
    profileUrl: string;
    profileHeadline: string;
    verificationBadge: string | null;
    trustSummary: string;
    checkoutDisclosure: string;
    payoutPolicy: string;
    refundPolicy: string;
    supportPolicy: string;
}

export function resolveMarketplaceProvider(
    providerId: string,
    providers: MarketplaceProviderSummary[]
): ResolvedMarketplaceProvider {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
        const fallbackName = providerId
            .split(/[-_]/g)
            .filter(Boolean)
            .map((segment) => segment[0].toUpperCase() + segment.slice(1))
            .join(' ');
        return {
            id: providerId,
            displayName: fallbackName || providerId,
            icon: '🏬',
            profileUrl: '/marketplace/providers',
            profileHeadline: 'Provider profile details are coming soon.',
            verificationBadge: null,
            trustSummary: 'Provider trust metadata is unavailable for this listing.',
            checkoutDisclosure: `Checkout opens on ${fallbackName || providerId}; review terms before payment.`,
            payoutPolicy: 'Payout policy is disclosed by the provider.',
            refundPolicy: 'Refund policy is controlled by the provider.',
            supportPolicy: 'Support contacts are shown in checkout.',
        };
    }

    return {
        id: provider.id,
        displayName: provider.presentation?.label ?? provider.displayName,
        icon: provider.presentation?.icon ?? '🏬',
        profileUrl: provider.profileUrl,
        profileHeadline: provider.presentation?.profileHeadline ?? provider.displayName,
        verificationBadge: provider.trust?.verificationBadge ?? null,
        trustSummary: provider.trust?.trustSummary ?? 'Provider trust metadata is unavailable for this listing.',
        checkoutDisclosure:
            provider.trust?.checkoutDisclosure ??
            `Checkout opens on ${provider.displayName}; review terms before payment.`,
        payoutPolicy: provider.trust?.payoutPolicy ?? 'Payout policy is disclosed by the provider.',
        refundPolicy: provider.trust?.refundPolicy ?? 'Refund policy is controlled by the provider.',
        supportPolicy: provider.trust?.supportPolicy ?? 'Support contacts are shown in checkout.',
    };
}
