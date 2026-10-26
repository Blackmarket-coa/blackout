// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ReleaseKeySet, ReleaseRecoveryContents } from '@blackout/protocol';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    mergeRecoveryContents,
    planRecoveryLoad,
    toRecoveryContents,
    withComparison,
    withNewCurrentKeySet,
    type DeviceReleaseKeys,
} from '../../../../src/app/features/release-keys/releaseKeyStore';
import { ALICE, BOB } from '../../../../../../packages/blackout-protocol/src/release/testVectors';

const keySetOf = (person: typeof ALICE, createdAt = person.createdAt): ReleaseKeySet => ({
    identity: person.identity,
    fingerprint: person.fingerprint,
    signingPrivateJwk: person.signingPrivateJwk,
    x25519PrivateJwk: person.x25519PrivateJwk,
    mlkem768SecretKey: person.mlkem768SecretKey,
    createdAt,
});

const NOW = new Date('2026-10-26T12:00:00Z');
const accountId = ALICE.identity.accountId;
const comparison = (fingerprint: string, comparedAt: string) => ({
    accountId: BOB.identity.accountId,
    matrixId: '@bob:blackout.example',
    fingerprint,
    ownFingerprint: ALICE.fingerprint,
    comparedAt,
});

describe('the device key store (IndexedDB)', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'indexedDB', {
            configurable: true,
            value: new IDBFactory(),
        });
    });
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'indexedDB');
    });

    it('keeps one record per account, and removes it', async () => {
        const alice = withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW);
        const bob = withNewCurrentKeySet(null, BOB.identity.accountId, keySetOf(BOB), NOW);
        await indexedDbReleaseKeyStore.save(alice);
        await indexedDbReleaseKeyStore.save(bob);
        expect(await indexedDbReleaseKeyStore.load(accountId)).toEqual(alice);
        expect(await indexedDbReleaseKeyStore.load(BOB.identity.accountId)).toEqual(bob);
        expect(await indexedDbReleaseKeyStore.remove(accountId)).toBe(true);
        expect(await indexedDbReleaseKeyStore.load(accountId)).toBeNull();
        expect(await indexedDbReleaseKeyStore.load(BOB.identity.accountId)).toEqual(bob);
    });

    // M3 (independent review, 2026-10-26): every change reads and writes in
    // one transaction, so two tabs cannot overwrite each other's changes.
    it('applies two changes made at once to the same record, losing neither', async () => {
        await indexedDbReleaseKeyStore.save(
            withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW)
        );
        const replacement = { ...keySetOf(BOB), identity: { ...BOB.identity, accountId } };
        // Started together, as two tabs would: each change starts from what is
        // stored when its transaction runs, not from a copy read earlier.
        const [afterNewKeys, afterComparison] = await Promise.all([
            indexedDbReleaseKeyStore.update(accountId, (stored) =>
                withNewCurrentKeySet(stored, accountId, replacement, NOW)
            ),
            indexedDbReleaseKeyStore.update(accountId, (stored) =>
                stored
                    ? withComparison(
                          stored,
                          comparison('f'.repeat(64), '2026-10-26T11:00:00.000Z'),
                          NOW
                      )
                    : undefined
            ),
        ]);
        expect(currentKeySet(afterNewKeys)?.fingerprint).toBe(BOB.fingerprint);
        const stored = await indexedDbReleaseKeyStore.load(accountId);
        expect(stored).toEqual(afterComparison);
        expect(stored?.keySets.map((set) => [set.fingerprint, set.status])).toEqual([
            [ALICE.fingerprint, 'superseded'],
            [BOB.fingerprint, 'current'],
        ]);
        expect(stored?.comparisons).toHaveLength(1);
    });

    it('a change built on keys removed in another tab writes nothing back', async () => {
        await indexedDbReleaseKeyStore.save(
            withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW)
        );
        expect(await indexedDbReleaseKeyStore.remove(accountId)).toBe(true);
        const after = await indexedDbReleaseKeyStore.update(accountId, (stored) =>
            stored
                ? withComparison(stored, comparison(BOB.fingerprint, NOW.toISOString()), NOW)
                : undefined
        );
        expect(after).toBeNull();
        expect(await indexedDbReleaseKeyStore.load(accountId)).toBeNull();
    });

    it('removes only the record the caller saw', async () => {
        const seen = withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW);
        await indexedDbReleaseKeyStore.save(seen);
        const later = new Date(NOW.getTime() + 60_000);
        const replacement = { ...keySetOf(BOB), identity: { ...BOB.identity, accountId } };
        await indexedDbReleaseKeyStore.update(accountId, (stored) =>
            withNewCurrentKeySet(stored, accountId, replacement, later)
        );
        expect(await indexedDbReleaseKeyStore.remove(accountId, seen)).toBe(false);
        const now = await indexedDbReleaseKeyStore.load(accountId);
        expect(currentKeySet(now)?.fingerprint).toBe(BOB.fingerprint);
        expect(await indexedDbReleaseKeyStore.remove(accountId, now)).toBe(true);
        expect(await indexedDbReleaseKeyStore.load(accountId)).toBeNull();
    });

    it('refuses a change that moves a record to another account, and stores nothing', async () => {
        await expect(
            indexedDbReleaseKeyStore.update(accountId, () =>
                withNewCurrentKeySet(null, BOB.identity.accountId, keySetOf(BOB), NOW)
            )
        ).rejects.toThrow(/own account/);
        expect(await indexedDbReleaseKeyStore.load(accountId)).toBeNull();
        expect(await indexedDbReleaseKeyStore.load(BOB.identity.accountId)).toBeNull();
    });
});

describe('device key records', () => {
    it('a new key set becomes current and the old one is kept, superseded', () => {
        const first = withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW);
        expect(currentKeySet(first)?.fingerprint).toBe(ALICE.fingerprint);
        const replacement = { ...keySetOf(BOB), identity: { ...BOB.identity, accountId } };
        const second = withNewCurrentKeySet(first, accountId, replacement, NOW);
        expect(second.keySets.map((set) => set.status)).toEqual(['superseded', 'current']);
        expect(currentKeySet(second)?.fingerprint).toBe(BOB.fingerprint);
    });

    it('records a comparison once per person and key', () => {
        const record = withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW);
        const once = withComparison(
            record,
            comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z'),
            NOW
        );
        const twice = withComparison(
            once,
            comparison(BOB.fingerprint, '2026-10-26T11:00:00.000Z'),
            NOW
        );
        expect(twice.comparisons).toHaveLength(1);
        expect(twice.comparisons[0].comparedAt).toBe('2026-10-26T11:00:00.000Z');
        const otherKey = withComparison(
            twice,
            comparison('f'.repeat(64), '2026-10-26T11:30:00.000Z'),
            NOW
        );
        expect(otherKey.comparisons).toHaveLength(2);
    });

    // M4 (independent review, 2026-10-26): a file whose current key is older
    // than this device's, or was replaced, does not quietly become current.
    const deviceWith = (createdAt: string): DeviceReleaseKeys =>
        withComparison(
            withNewCurrentKeySet(
                null,
                accountId,
                { ...keySetOf(BOB, createdAt), identity: { ...BOB.identity, accountId } },
                NOW
            ),
            comparison(BOB.fingerprint, '2026-10-26T09:00:00.000Z'),
            NOW
        );
    // The file holds Alice's vector keys, created 2026-10-26T10:00.
    const fileContents: ReleaseRecoveryContents = {
        v: 1,
        accountId,
        savedAt: '2026-10-26T11:00:00.000Z',
        keySets: [{ ...keySetOf(ALICE), status: 'current' }],
        comparisons: [comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z')],
    };

    it('takes in a newer recovery file without asking: its current key becomes current', () => {
        const here = deviceWith('2026-10-26T09:00:00.000Z');
        expect(planRecoveryLoad(here, fileContents)).toEqual({ kind: 'adopt' });
        const merged = mergeRecoveryContents(here, fileContents, NOW, 'file');
        expect(currentKeySet(merged)?.fingerprint).toBe(ALICE.fingerprint);
        expect(merged.keySets.map((set) => [set.fingerprint, set.status])).toEqual([
            [BOB.fingerprint, 'superseded'],
            [ALICE.fingerprint, 'current'],
        ]);
        expect(merged.comparisons).toEqual([
            comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z'),
        ]);
        // A device with no keys takes the file as it is.
        expect(planRecoveryLoad(null, fileContents)).toEqual({ kind: 'adopt' });
        expect(mergeRecoveryContents(null, fileContents, NOW, 'file').keySets).toEqual(
            fileContents.keySets
        );
    });

    it('asks before an older file’s key replaces this device’s, and keeps this device’s by choice', () => {
        // The device's key was made after the file's: the review's probe.
        const here = deviceWith('2026-10-26T11:30:00.000Z');
        const plan = planRecoveryLoad(here, fileContents);
        expect(plan).toMatchObject({ kind: 'ask', reason: 'older' });
        const kept = mergeRecoveryContents(here, fileContents, NOW, 'device');
        expect(currentKeySet(kept)?.fingerprint).toBe(BOB.fingerprint);
        expect(kept.keySets.map((set) => [set.fingerprint, set.status])).toEqual([
            [BOB.fingerprint, 'current'],
            [ALICE.fingerprint, 'superseded'],
        ]);
        expect(kept.comparisons).toEqual([comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z')]);
    });

    it('asks when the file’s key was replaced, here or on the server, even if it looks newer', () => {
        // Replaced on this device: the device holds it as superseded.
        const older = { ...keySetOf(BOB, '2026-10-26T09:00:00.000Z') };
        const replacedHere = withNewCurrentKeySet(
            withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW),
            accountId,
            { ...older, identity: { ...BOB.identity, accountId } },
            NOW
        );
        expect(planRecoveryLoad(replacedHere, fileContents)).toMatchObject({
            kind: 'ask',
            reason: 'replaced',
        });
        // Replaced on the server: its directory lists the fingerprint as superseded.
        const here = deviceWith('2026-10-26T09:00:00.000Z');
        expect(planRecoveryLoad(here, fileContents, new Set([ALICE.fingerprint]))).toMatchObject({
            kind: 'ask',
            reason: 'replaced',
        });
    });

    it('changes nothing about the current key when the file has the same one', () => {
        const here = withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW);
        expect(planRecoveryLoad(here, fileContents)).toEqual({ kind: 'same' });
        const merged = mergeRecoveryContents(here, fileContents, NOW, 'device');
        expect(currentKeySet(merged)?.fingerprint).toBe(ALICE.fingerprint);
        expect(merged.keySets).toHaveLength(1);
    });

    it('saves everything the device has in a recovery file', () => {
        const record = withComparison(
            withNewCurrentKeySet(null, accountId, keySetOf(ALICE), NOW),
            comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z'),
            NOW
        );
        expect(toRecoveryContents(record, NOW)).toEqual({
            v: 1,
            accountId,
            savedAt: NOW.toISOString(),
            keySets: record.keySets,
            comparisons: record.comparisons,
        });
    });
});
