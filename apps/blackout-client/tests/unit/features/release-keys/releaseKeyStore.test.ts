// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ReleaseKeySet, ReleaseRecoveryContents } from '@blackout/protocol';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    mergeRecoveryContents,
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
        await indexedDbReleaseKeyStore.remove(accountId);
        expect(await indexedDbReleaseKeyStore.load(accountId)).toBeNull();
        expect(await indexedDbReleaseKeyStore.load(BOB.identity.accountId)).toEqual(bob);
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

    it('takes in a recovery file: its current keys become current, others are kept', () => {
        const here: DeviceReleaseKeys = withComparison(
            withNewCurrentKeySet(
                null,
                accountId,
                { ...keySetOf(BOB), identity: { ...BOB.identity, accountId } },
                NOW
            ),
            comparison(BOB.fingerprint, '2026-10-26T09:00:00.000Z'),
            NOW
        );
        const contents: ReleaseRecoveryContents = {
            v: 1,
            accountId,
            savedAt: '2026-10-26T11:00:00.000Z',
            keySets: [{ ...keySetOf(ALICE), status: 'current' }],
            comparisons: [comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z')],
        };
        const merged = mergeRecoveryContents(here, contents, NOW);
        expect(currentKeySet(merged)?.fingerprint).toBe(ALICE.fingerprint);
        expect(merged.keySets.map((set) => [set.fingerprint, set.status])).toEqual([
            [BOB.fingerprint, 'superseded'],
            [ALICE.fingerprint, 'current'],
        ]);
        expect(merged.comparisons).toEqual([
            comparison(BOB.fingerprint, '2026-10-26T10:00:00.000Z'),
        ]);
        expect(mergeRecoveryContents(null, contents, NOW).keySets).toEqual(contents.keySets);
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
