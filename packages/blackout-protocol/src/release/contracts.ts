/**
 * The API's release-identity directory, as the SDK and the client see it.
 * Routes (`packages/api/src/routes/releaseIdentities.ts`):
 *
 *   GET /v1/release-identities/me                  the caller's own entry
 *   PUT /v1/release-identities/me                  publish the caller's identity
 *   GET /v1/release-identities/:accountId          anyone's entry
 *   GET /v1/release-identities/lookup?matrixId=…   by Matrix id, this homeserver only
 *
 * A fingerprint in a response is the server's; a client recomputes it with
 * `verifyReleaseIdentity` and never relies on the one sent.
 */

import type { ReleaseIdentity } from './identity';

export type ReleaseIdentityEntry = {
    identity: ReleaseIdentity;
    fingerprint: string;
    publishedAt: string;
    /** Set once a newer identity replaced this one. */
    supersededAt?: string;
};

export type ReleaseIdentityDirectoryEntry = {
    accountId: string;
    /** The account's Matrix id on this homeserver, for display. */
    matrixId: string | null;
    /** Null only in the caller's own entry, before they publish. */
    current: ReleaseIdentityEntry | null;
    /** Replaced identities, newest first. */
    superseded: ReleaseIdentityEntry[];
};

export type ReleaseIdentityPublishResult = ReleaseIdentityDirectoryEntry & {
    /** False when the identity sent was already the current one. */
    changed: boolean;
};

/** How many identities the API keeps per account, current and replaced. */
export const RELEASE_IDENTITY_HISTORY_LIMIT = 32;

export const RELEASE_IDENTITY_ERRORS = {
    notFound: 'release_identity_not_found',
    invalid: 'invalid_release_identity',
    notYours: 'release_identity_not_yours',
    limit: 'release_identity_limit',
} as const;
