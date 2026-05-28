export type DebugBundleSettingsSnapshot = {
    appearance: unknown;
    notifications: unknown;
    privacy: unknown;
    accessibility: unknown;
    voiceVideo: unknown;
    keybinds: unknown;
};

export type DebugBundleOptions = {
    settings?: DebugBundleSettingsSnapshot;
    includeLocalStorage?: boolean;
    includeFeatureFlags?: boolean;
    featureFlags?: Record<string, unknown>;
};

export type DebugBundle = {
    generatedAt: string;
    url: string;
    userAgent: string;
    viewport: { width: number; height: number };
    settings?: DebugBundleSettingsSnapshot;
    localStorage?: Record<string, string | null>;
    featureFlags?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERNS = [
    'access_token',
    'refresh_token',
    'matrix.sessions',
    'push.token',
];

const readLocalStorageKeys = (): Record<string, string | null> => {
    if (typeof window === 'undefined') return {};
    return Object.fromEntries(
        Object.keys(window.localStorage)
            .filter((key) => key.startsWith('blackout.'))
            .filter((key) => !SENSITIVE_KEY_PATTERNS.some((pattern) => key.includes(pattern)))
            .map((key) => [key, window.localStorage.getItem(key)])
    );
};

export const buildDebugBundle = (options: DebugBundleOptions = {}): DebugBundle => ({
    generatedAt: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    viewport:
        typeof window !== 'undefined'
            ? { width: window.innerWidth, height: window.innerHeight }
            : { width: 0, height: 0 },
    settings: options.settings,
    localStorage:
        options.includeLocalStorage && typeof window !== 'undefined'
            ? readLocalStorageKeys()
            : undefined,
    featureFlags: options.includeFeatureFlags ? options.featureFlags : undefined,
});

export const downloadDebugBundle = (options: DebugBundleOptions = {}): DebugBundle => {
    const bundle = buildDebugBundle(options);
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return bundle;
    }

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `blackout-debug-bundle-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return bundle;
};
