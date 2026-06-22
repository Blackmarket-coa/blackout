import { createFetchApiClient } from '@blackout/sdk';

// Zero-auth Matrix public profile reads (displayname/avatar). Cross-origin
// against the homeserver, so the URL is passed absolute (the SDK fetch client
// resolves absolute `https?://` paths verbatim).
const matrixClient = createFetchApiClient({
    defaultRetry: { attempts: 2, backoffMs: 120 },
});

export interface MatrixProfile {
    displayname?: string;
    avatar_url?: string;
}

/**
 * Read a user's public Matrix profile. Resolves to `null` on any failure so
 * callers can fall back to other display-name/avatar sources.
 */
export const fetchMatrixProfile = async (
    homeserverUrl: string,
    userId: string,
): Promise<MatrixProfile | null> => {
    try {
        return await matrixClient<MatrixProfile>({
            method: 'GET',
            path: `${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}`,
        });
    } catch {
        return null;
    }
};
