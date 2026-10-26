/**
 * The API's release-identity directory, as the SDK and the client see it.
 * Routes (`packages/api/src/routes/releaseIdentities.ts`):
 *
 *   GET  /v1/release-identities/me           the caller's own entry
 *   PUT  /v1/release-identities/me           publish the caller's identity
 *   GET  /v1/release-identities/:accountId   anyone's entry
 *   POST /v1/release-identities/lookup       by Matrix id ({ matrixId } in the
 *                                            body), this homeserver only
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

/**
 * How many new identities an account may publish in any 24 hours (429 past
 * that). Republishing the current identity does not count. Every identity an
 * account published is kept, so this, not a cap on history, is what bounds a
 * buggy client or a stolen session.
 */
export const RELEASE_IDENTITY_PUBLISHES_PER_DAY = 3;

/**
 * The most identities the API keeps for one account, current and replaced,
 * there only to bound storage: at the daily limit it takes 334 days of
 * publishing every day to reach. Past it, publishing is refused (409).
 */
export const RELEASE_IDENTITY_STORAGE_LIMIT = 1000;

export const RELEASE_IDENTITY_ERRORS = {
    notFound: 'release_identity_not_found',
    invalid: 'invalid_release_identity',
    notYours: 'release_identity_not_yours',
    /** 409: the identity was this account's before and was replaced. */
    reused: 'release_identity_reused',
    /** 429: `RELEASE_IDENTITY_PUBLISHES_PER_DAY` reached. */
    rateLimited: 'release_identity_rate_limited',
    /** 409: `RELEASE_IDENTITY_STORAGE_LIMIT` reached. */
    limit: 'release_identity_limit',
} as const;
