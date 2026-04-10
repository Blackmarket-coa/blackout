export type FeatureFlags = {
    governance: boolean;
    forum: boolean;
    deaddrop: boolean;
    steganography: boolean;
    moderation: boolean;
    logistics: boolean;
};

export const defaultFeatureFlags: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
    steganography: false,
    moderation: false,
    logistics: false,
};
