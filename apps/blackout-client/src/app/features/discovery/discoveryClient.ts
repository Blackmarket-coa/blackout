import { createFetchApiClient } from '@blackout/sdk';
import { API_BASE_URL } from '../../sdk/client';
import { ensureBlackoutApiToken } from '../../../client/blackoutApiSession';

const CANOPY_INDEX_PATH = '/v1/discovery/index/canopies';

export type CanopyFederationTier = 'local' | 'zone' | 'global';

export interface IndexCanopyInput {
    canopyId: string;
    name: string;
    summary?: string;
    federationTier?: CanopyFederationTier;
}

export interface CanopyDirectoryEntry {
    canopyId: string;
    name: string;
    summary?: string;
    federationTier: CanopyFederationTier;
    indexedAt: string;
}

/**
 * Register a canopy (Matrix space) in the Blackout discovery directory.
 *
 * Without this, a freshly created canopy is invisible to browse/search and —
 * because `hasCanopy` gates them server-side — its voice rooms and app installs
 * can't be created. The `discovery.write` capability is minted in the session
 * JWT by `deriveUserCapabilities()` (see
 * `packages/api/src/services/auth.ts`).
 *
 * Resolves the Blackout API JWT lazily via `ensureBlackoutApiToken()` so it
 * works even when called right after space creation (before a passed-in token
 * would be ready). Rejects on transport errors / non-2xx; callers that index as
 * a side effect of creation should treat failure as non-fatal.
 */
export const indexCanopy = async (
    input: IndexCanopyInput,
    token: string | null = null
): Promise<CanopyDirectoryEntry> => {
    const bearer = token ?? (await ensureBlackoutApiToken());
    return createFetchApiClient({
        baseUrl: API_BASE_URL,
        defaultHeaders: {
            ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        defaultRetry: { attempts: 3, backoffMs: 100 },
    })({ method: 'POST', path: CANOPY_INDEX_PATH, body: input }) as Promise<CanopyDirectoryEntry>;
};
