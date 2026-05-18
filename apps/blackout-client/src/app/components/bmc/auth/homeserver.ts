import { useEffect, useState } from 'react';
import { AuthType, createClient, type IAuthData, type MatrixError } from 'matrix-js-sdk';
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

/**
 * State of the homeserver's `/register` endpoint. `unknown` is the
 * initial value while the probe is in flight; `available` covers both
 * 200 (no auth required) and 401 with UIA flows; `disabled` is the
 * server explicitly rejecting registration with 403.
 */
export type RegistrationAvailability = 'unknown' | 'available' | 'disabled' | 'error';

export type RegistrationProbe = {
    state: RegistrationAvailability;
    /**
     * UIA flow descriptor returned by the homeserver's 401 challenge, or a
     * synthetic Dummy flow if the server allows no-auth registration. Null
     * while the probe is in flight, on 403, or on transport error.
     */
    authData: IAuthData | null;
    errorMessage: string | null;
};

const idleProbe: RegistrationProbe = {
    state: 'unknown',
    authData: null,
    errorMessage: null,
};

/**
 * Probes the homeserver's `/register` endpoint to discover available
 * registration flows. Pass `null` to defer the probe — the Matrix UIA
 * spec requires a POST with no auth dict, and the homeserver answers with
 * 401, which browsers surface as a red console error. Callers should only
 * enable the probe when the user is actually heading to the register UI.
 */
export const useRegistrationProbe = (
    server: ResolvedHomeserver | null
): RegistrationProbe => {
    const [probe, setProbe] = useState<RegistrationProbe>(idleProbe);

    useEffect(() => {
        if (!server) {
            setProbe(idleProbe);
            return;
        }
        let cancelled = false;
        setProbe(idleProbe);
        const mx = createClient({ baseUrl: server.baseUrl });
        mx.registerRequest({})
            .then(() => {
                if (cancelled) return;
                setProbe({
                    state: 'available',
                    authData: { flows: [{ stages: [AuthType.Dummy] }] } as IAuthData,
                    errorMessage: null,
                });
            })
            .catch((err: MatrixError) => {
                if (cancelled) return;
                if (err.httpStatus === 401 && err.data) {
                    setProbe({
                        state: 'available',
                        authData: err.data as IAuthData,
                        errorMessage: null,
                    });
                } else if (err.httpStatus === 403) {
                    setProbe({
                        state: 'disabled',
                        authData: null,
                        errorMessage: 'Registration is disabled on this homeserver.',
                    });
                } else if (err.httpStatus === 429) {
                    setProbe({
                        state: 'error',
                        authData: null,
                        errorMessage:
                            'Too many registration attempts; please try again later.',
                    });
                } else {
                    setProbe({
                        state: 'error',
                        authData: null,
                        errorMessage: err.message || 'Could not load registration flows.',
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [server?.baseUrl]);

    return probe;
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
