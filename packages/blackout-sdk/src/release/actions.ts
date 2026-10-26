import {
    publicReleaseIdentity,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
    type ReleaseIdentityPublishResult,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

/**
 * The API's release-identity directory (`/v1/release-identities`): publish
 * your own identity and fetch other people's. Every response is the server's
 * word: check an identity with `verifyReleaseIdentity` before relying on it,
 * and compare a safety code with its owner before trusting it at all
 * (`docs/security/release-identities-2026-10-26.md`).
 *
 * Nobody is distinguished from somebody: an unknown account, an account
 * without an identity and a Matrix id on another homeserver all get 404.
 */
export const createReleaseIdentityActions = (client: ApiClient) => ({
    /** The caller's own entry; `current` is null until they publish. */
    getMine: () =>
        client<ReleaseIdentityDirectoryEntry>({
            method: 'GET',
            path: '/v1/release-identities/me',
        }),
    /**
     * Publish the caller's identity. Only the six public fields are sent,
     * whatever object is passed, so a key set cannot leak its private keys
     * through this call. The API checks the signature and that the identity
     * names the caller; a different identity from the current one replaces
     * it, and the old one stays listed as superseded.
     */
    publishMine: (identity: ReleaseIdentity) =>
        client<ReleaseIdentityPublishResult>({
            method: 'PUT',
            path: '/v1/release-identities/me',
            body: { identity: publicReleaseIdentity(identity) },
        }),
    /** An account's entry by Blackout account id. */
    getForAccount: (accountId: string) =>
        client<ReleaseIdentityDirectoryEntry>({
            method: 'GET',
            path: `/v1/release-identities/${encodeURIComponent(accountId)}`,
        }),
    /**
     * An account's entry by Matrix id. Only a Matrix id on this homeserver,
     * exactly as the account has it, finds anyone.
     */
    lookupByMatrixId: (matrixId: string) =>
        client<ReleaseIdentityDirectoryEntry>({
            method: 'GET',
            path: `/v1/release-identities/lookup?matrixId=${encodeURIComponent(matrixId)}`,
        }),
});

export type ReleaseIdentityActions = ReturnType<typeof createReleaseIdentityActions>;

export type { ReleaseIdentity, ReleaseIdentityDirectoryEntry, ReleaseIdentityPublishResult };
