/**
 * The release-identity directory: the public keys people publish for
 * dead-man switch releases, and what anyone signed in on this homeserver can
 * read of them (`docs/security/release-identities-2026-10-26.md`).
 *
 * The API checks every identity it is given with the protocol's own
 * validator, the one the clients run: its signature, its keys and that it
 * names the caller. That catches client bugs; it is not why anyone may trust
 * a key. Clients check identities themselves and compare a safety code
 * before relying on one, because a server that wanted to could hand out
 * other keys.
 */
import { randomUUID } from 'node:crypto';
import {
    RELEASE_IDENTITY_PUBLISHES_PER_DAY,
    RELEASE_IDENTITY_STORAGE_LIMIT,
    verifyReleaseIdentity,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
    type ReleaseIdentityEntry,
    type ReleaseIdentityProblem,
} from '@blackout/protocol';
import { db } from '../db/store';
import type { ReleaseIdentityRecord } from '../db/types';
import { matrixLocalpart, matrixUserIdFor } from './userIdentity';

/** The six public fields, as the account published them. */
export const recordToReleaseIdentity = (record: ReleaseIdentityRecord): ReleaseIdentity => ({
    v: record.formatVersion as ReleaseIdentity['v'],
    accountId: record.accountId,
    signingKey: record.signingKey,
    x25519Key: record.x25519Key,
    mlkem768Key: record.mlkem768Key,
    signature: record.signature,
});

const toEntry = (record: ReleaseIdentityRecord): ReleaseIdentityEntry => ({
    identity: recordToReleaseIdentity(record),
    fingerprint: record.fingerprint,
    publishedAt: record.publishedAt,
    ...(record.supersededAt ? { supersededAt: record.supersededAt } : {}),
});

/** An account's directory entry: its current identity, if any, and the ones it replaced. */
export const releaseIdentityEntryFor = (accountId: string): ReleaseIdentityDirectoryEntry => {
    const rows = db.listReleaseIdentitiesForAccount(accountId);
    const current = rows.find((record) => !record.supersededAt);
    return {
        accountId,
        matrixId: matrixUserIdFor(accountId),
        current: current ? toEntry(current) : null,
        superseded: rows.filter((record) => record !== current).map(toEntry),
    };
};

/**
 * The account a Matrix id names, or null. Only the exact Matrix id this
 * homeserver gives an account finds it: `matrixLocalpart` refuses another
 * server's name (#981), and the comparison with the account's own Matrix id
 * refuses another spelling of the localpart and anything that is not a
 * Matrix id at all, such as an account id. Every miss gets the same answer.
 */
export const accountForLocalMatrixId = (matrixId: string): string | null => {
    if (matrixId.length > 255) return null;
    const localpart = matrixLocalpart(matrixId);
    if (!localpart) return null;
    const user = db.findUserByUsername(localpart);
    if (!user || matrixUserIdFor(user.id) !== matrixId) return null;
    return user.id;
};

export type PublishReleaseIdentityOutcome =
    | { kind: 'published'; changed: boolean; entry: ReleaseIdentityDirectoryEntry }
    | { kind: 'invalid'; problem: ReleaseIdentityProblem }
    | { kind: 'not_yours' }
    | { kind: 'reused' }
    | { kind: 'rate_limited'; retryAfterSeconds: number }
    | { kind: 'limit' }
    | { kind: 'no_account' };

const PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Publish `input` as `accountId`'s release identity. An identity equal to
 * the current one changes nothing. Any other identity the account published
 * before is refused (`reused`): a replaced identity is never made current
 * again, whoever asks, so a stolen session cannot put back a key its owner
 * replaced after losing a device (the independent review's H1). A new one
 * becomes current and the old one is kept as superseded, every one of them:
 * the history is what that refusal reads. At most
 * `RELEASE_IDENTITY_PUBLISHES_PER_DAY` new identities in any 24 hours
 * (`rate_limited`, with when the oldest of them leaves the window), and at
 * most `RELEASE_IDENTITY_STORAGE_LIMIT` in all (`limit`), a bound on storage
 * only.
 */
export const publishReleaseIdentity = async (
    accountId: string,
    input: unknown,
    now: () => Date = () => new Date()
): Promise<PublishReleaseIdentityOutcome> => {
    const check = await verifyReleaseIdentity(input);
    if (!check.ok) {
        if (check.problem === 'unsupported') {
            throw new Error('release identities: this runtime lacks WebCrypto Ed25519 or X25519');
        }
        return { kind: 'invalid', problem: check.problem };
    }
    if (check.identity.accountId !== accountId) return { kind: 'not_yours' };

    // The checks above awaited, so the account and its history are read now,
    // and nothing below awaits before the write.
    if (!db.getUserById(accountId)) return { kind: 'no_account' };
    const history = db.listReleaseIdentitiesForAccount(accountId);
    const current = history.find((record) => !record.supersededAt);
    if (current && current.fingerprint === check.fingerprint) {
        return { kind: 'published', changed: false, entry: releaseIdentityEntryFor(accountId) };
    }
    if (history.some((record) => record.fingerprint === check.fingerprint)) {
        return { kind: 'reused' };
    }
    const at = now().getTime();
    const recent = history
        .map((record) => Date.parse(record.publishedAt))
        .filter((publishedAt) => publishedAt > at - PUBLISH_WINDOW_MS);
    if (recent.length >= RELEASE_IDENTITY_PUBLISHES_PER_DAY) {
        const opensAt = Math.min(...recent) + PUBLISH_WINDOW_MS;
        return {
            kind: 'rate_limited',
            retryAfterSeconds: Math.max(1, Math.ceil((opensAt - at) / 1000)),
        };
    }
    if (history.length >= RELEASE_IDENTITY_STORAGE_LIMIT) return { kind: 'limit' };
    db.publishReleaseIdentity({
        id: randomUUID(),
        accountId,
        formatVersion: check.identity.v,
        signingKey: check.identity.signingKey,
        x25519Key: check.identity.x25519Key,
        mlkem768Key: check.identity.mlkem768Key,
        signature: check.identity.signature,
        fingerprint: check.fingerprint,
    });
    return { kind: 'published', changed: true, entry: releaseIdentityEntryFor(accountId) };
};
