import { autoDiscovery, specVersions } from '../../../cs-api';
import type { ResolvedHomeserver } from './types';

const FALLBACK_HOMESERVER_URL =
    (import.meta.env.VITE_MATRIX_HOMESERVER_URL as string | undefined) ??
    'https://matrix.theblackout.app';

type RuntimeClientConfig = {
    defaultHomeserver?: number;
    homeserverList?: string[];
    allowCustomHomeservers?: boolean;
};

let cachedClientConfig: RuntimeClientConfig | null = null;

export const loadClientConfig = async (): Promise<RuntimeClientConfig> => {
    if (cachedClientConfig) return cachedClientConfig;
    try {
        // Direct fetch is allowed here (documented exemption): /config.json is
        // loaded before the SDK is initialized, so it cannot route through
        // clientQueries. See apps/blackout-client/src/app/sdk/NETWORK_BOUNDARY_INVENTORY.md.
        const response = await fetch('/config.json', { cache: 'no-cache' });
        if (!response.ok) {
            cachedClientConfig = {};
            return cachedClientConfig;
        }
        cachedClientConfig = (await response.json()) as RuntimeClientConfig;
    } catch {
        cachedClientConfig = {};
    }
    return cachedClientConfig;
};

export const defaultHomeserverFromConfig = (cfg: RuntimeClientConfig): string => {
    const host = cfg.homeserverList?.[cfg.defaultHomeserver ?? 0];
    if (host) return host;
    try {
        return new URL(FALLBACK_HOMESERVER_URL).hostname;
    } catch {
        return FALLBACK_HOMESERVER_URL;
    }
};

export const resolveHomeserver = async (rawInput: string): Promise<ResolvedHomeserver> => {
    const trimmed = rawInput.trim();
    if (!trimmed) {
        throw new Error('Please enter a homeserver.');
    }

    const [discoveryError, info] = await autoDiscovery(fetch, trimmed);
    if (discoveryError || !info) {
        throw new Error(`Homeserver "${trimmed}" is unreachable or invalid.`);
    }

    const baseUrl = info['m.homeserver'].base_url;

    try {
        await specVersions(fetch, baseUrl);
    } catch {
        throw new Error(`"${baseUrl}" does not appear to be a Matrix homeserver.`);
    }

    let serverName: string;
    try {
        const url = new URL(baseUrl);
        serverName = url.hostname;
    } catch {
        serverName = trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    return { rawInput: trimmed, serverName, baseUrl };
};
