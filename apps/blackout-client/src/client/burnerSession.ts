import { createFetchApiClient } from '@blackout/sdk';
import { createStore } from 'jotai/vanilla';
import { API_BASE_URL } from '../app/sdk/apiBaseUrl';
import { clearBlackoutApiToken, ensureBlackoutApiToken } from './blackoutApiSession';
import { loginWithPassword } from './auth';
import { deleteSessionStores } from './initMatrix';
import { clearSession, getSessionForUser } from './sessionManager';

type AtomStore = ReturnType<typeof createStore>;

export interface BurnerPublic {
    id: string;
    burnerUserId: string;
    label: string;
    expiresAt: string | null;
    burnedAt: string | null;
    createdAt: string;
}

interface CreateBurnerResponse {
    burner: BurnerPublic;
    password: string;
    baseUrl: string;
}

class BurnerApiError extends Error {}

const authedClient = async () => {
    const token = await ensureBlackoutApiToken();
    if (!token) {
        throw new BurnerApiError('Not authenticated with the Blackout API.');
    }
    return createFetchApiClient({
        baseUrl: API_BASE_URL,
        defaultHeaders: { Authorization: `Bearer ${token}` },
        defaultRetry: { attempts: 2, backoffMs: 150 },
    });
};

/**
 * Provision a burner account server-side, then log into it — which makes it the
 * active session (the "enter" half of switch-to). Must be called while on the
 * primary account so the provisioning request is owned by the primary.
 * Returns the burner's public record for the local metadata list.
 */
export const provisionAndEnterBurner = async (
    store: AtomStore,
    input: { label: string; ttlHours?: number }
): Promise<BurnerPublic> => {
    const client = await authedClient();
    const response = (await client({
        method: 'POST',
        path: '/v1/identities',
        body: { label: input.label, ttlHours: input.ttlHours },
    })) as CreateBurnerResponse;

    if (!response?.burner?.burnerUserId || !response.password || !response.baseUrl) {
        throw new BurnerApiError('Burner provisioning returned an incomplete response.');
    }

    await loginWithPassword(store, {
        baseUrl: response.baseUrl,
        identifier: { type: 'm.id.user', user: response.burner.burnerUserId },
        password: response.password,
    });
    // The cached API token still belongs to the primary; drop it so the next
    // /v1 call re-exchanges as the burner now that it's the active session.
    clearBlackoutApiToken();

    return response.burner;
};

/**
 * Deactivate (erase) the burner account server-side. Call only while on the
 * primary account — ownership is enforced against the API JWT's primary mxid.
 */
export const requestBurnDeactivation = async (burnerUserId: string): Promise<void> => {
    const client = await authedClient();
    await client({
        method: 'POST',
        path: `/v1/identities/${encodeURIComponent(burnerUserId)}/burn`,
        body: {},
    });
};

/** Drop a burner's stored session and delete its local IndexedDB stores. */
export const purgeBurnerLocal = async (burnerUserId: string): Promise<void> => {
    const session = getSessionForUser(burnerUserId);
    clearSession(burnerUserId);
    if (session?.deviceId) {
        await deleteSessionStores(burnerUserId, session.deviceId);
    }
};
