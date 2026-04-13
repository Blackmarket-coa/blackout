export type FeatureFlags = {
    governance: boolean;
    forum: boolean;
    deaddrop: boolean;
    steganography: boolean;
    moderation: boolean;
    logistics: boolean;
    legacyShellLayout: boolean;
    legacyThemeOverrides: boolean;
    legacyRoomSurfaceLayout: boolean;
};

export const defaultFeatureFlags: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
    steganography: false,
    moderation: false,
    logistics: false,
    legacyShellLayout: false,
    legacyThemeOverrides: false,
    legacyRoomSurfaceLayout: false,
};
