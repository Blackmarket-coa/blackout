export type LegacyOverlayId = 'settings' | 'welcome' | 'onboarding';

export const LEGACY_OVERLAY_SEARCH_PARAM = 'overlay';
export const LEGACY_OVERLAY_SPACE_PARAM = 'overlaySpace';

const OVERLAY_IDS: LegacyOverlayId[] = ['settings', 'welcome', 'onboarding'];

export const parseLegacyOverlayId = (value: string | null): LegacyOverlayId | null => {
    if (!value) return null;
    return OVERLAY_IDS.includes(value as LegacyOverlayId) ? (value as LegacyOverlayId) : null;
};

export const withLegacyOverlay = (
    search: string,
    overlay: LegacyOverlayId,
    spaceId?: string,
): string => {
    const params = new URLSearchParams(search);
    params.set(LEGACY_OVERLAY_SEARCH_PARAM, overlay);
    if (spaceId) {
        params.set(LEGACY_OVERLAY_SPACE_PARAM, spaceId);
    } else {
        params.delete(LEGACY_OVERLAY_SPACE_PARAM);
    }
    const next = params.toString();
    return next ? `?${next}` : '';
};

export const withoutLegacyOverlay = (search: string): string => {
    const params = new URLSearchParams(search);
    params.delete(LEGACY_OVERLAY_SEARCH_PARAM);
    params.delete(LEGACY_OVERLAY_SPACE_PARAM);
    const next = params.toString();
    return next ? `?${next}` : '';
};

export interface LegacyOverlayVisibility {
    settings: boolean;
    welcome: boolean;
    onboarding: boolean;
}

export const getLegacyOverlayVisibility = (
    overlayId: LegacyOverlayId | null,
    canShowWelcome: boolean,
    canShowOnboarding: boolean,
): LegacyOverlayVisibility => ({
    settings: overlayId === 'settings',
    welcome: overlayId === 'welcome' && canShowWelcome,
    onboarding: overlayId === 'onboarding' && canShowOnboarding,
});
