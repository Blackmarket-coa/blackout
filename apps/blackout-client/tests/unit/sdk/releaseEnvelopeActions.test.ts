/**
 * The SDK's dead-man release calls (`createDeadmanReleaseActions`):
 * arming sends only the envelope, the timer and the label, and refuses, before
 * the envelope is sent (the directory is read first), a recipient whose
 * comparison does not count now (H1) and an owner key the directory does not
 * list as current, saying which key the directory served (P3-M3), and a
 * directory answer that is not an entry gets that refusal, not a TypeError
 * (the fourth reading); re-sealing
 * opens the owner's own copy and sends one new copy, and refuses an owner view
 * that is not the switch's (P3-H1); the release list refuses an entry that is
 * not one, whose ids are not of the id forms, or whose unsigned ids differ
 * from its header's (P3-M2). Against a fake API.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    BlackoutSdkError,
    createDeadmanReleaseActions,
    ReleaseActionError,
    type ApiClient,
    type ApiRequest,
} from '@blackout/sdk';
import {
    NULL_KEM_PROVIDER,
    buildReleaseEnvelope,
    createReleaseKeySet,
    mlKem768Provider,
    openReleaseCopy,
    parseReleaseEnvelope,
    releaseHeaderOf,
    setKemProvider,
    type DeadmanReleaseArmRequest,
    type ReleaseComparison,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
    type ReleaseKeySet,
} from '@blackout/protocol';
import { ALICE, BOB } from '../../../../../packages/blackout-protocol/src/release/testVectors';

const vectorKeySet = (person: typeof ALICE): ReleaseKeySet => ({
    identity: person.identity,
    fingerprint: person.fingerprint,
    signingPrivateJwk: person.signingPrivateJwk,
    x25519PrivateJwk: person.x25519PrivateJwk,
    mlkem768SecretKey: person.mlkem768SecretKey,
    createdAt: person.createdAt,
});

const entryFor = (
    accountId: string,
    current: ReleaseIdentity | null,
    superseded: ReleaseIdentity[] = []
): ReleaseIdentityDirectoryEntry => ({
    accountId,
    matrixId: null,
    current: current ? { identity: current, fingerprint: 'stated', publishedAt: 'x' } : null,
    superseded: superseded.map((identity) => ({
        identity,
        fingerprint: 'stated',
        publishedAt: 'x',
    })),
});

const bobComparison = (overrides: Partial<ReleaseComparison> = {}): ReleaseComparison => ({
    accountId: BOB.identity.accountId,
    matrixId: '@bob:blackout.example',
    fingerprint: BOB.fingerprint,
    ownFingerprint: ALICE.fingerprint,
    comparedAt: '2026-10-26T11:00:00.000Z',
    ...overrides,
});

/** What the fake API says to an arming: the server's word, which is not the device's. */
const SERVER_ARMED = {
    event: 'blackout.deadman.switch.armed',
    payload: { switchId: 'server-said' },
};

/**
 * A fake API: the directory as `entries` says, the owner's view of any switch
 * as `owned`, the release list as `releases`, everything else recorded.
 */
const fakeApi = (
    entries: Map<string, ReleaseIdentityDirectoryEntry>,
    owned?: unknown,
    releases: unknown = { releases: [] }
) => {
    const requests: ApiRequest[] = [];
    const client: ApiClient = async <T>(request: ApiRequest) => {
        requests.push(request);
        if (request.method === 'GET' && request.path === '/v1/release-identities/me') {
            return entries.get('me') as T;
        }
        const directory = /^\/v1\/release-identities\/(.+)$/.exec(request.path);
        if (request.method === 'GET' && directory) {
            const entry = entries.get(decodeURIComponent(directory[1]));
            if (!entry) throw new BlackoutSdkError('HTTP_REQUEST_FAILED', '404', 'fatal', 404);
            return entry as T;
        }
        if (request.method === 'GET' && /^\/v1\/deadman\/switches\/[^/]+$/.test(request.path)) {
            return owned as T;
        }
        if (request.method === 'GET' && request.path === '/v1/deadman/releases') {
            return releases as T;
        }
        if (request.method === 'POST' && request.path === '/v1/deadman/switches') {
            return SERVER_ARMED as T;
        }
        return {} as T;
    };
    const sent = () => requests.filter((request) => request.method === 'POST');
    return { client, requests, sent };
};

const armInput = (overrides: Record<string, unknown> = {}) => ({
    ownerKeySet: vectorKeySet(ALICE),
    recipients: [{ accountId: BOB.identity.accountId, comparison: bobComparison() }],
    message: 'Released words, sealed on the owner’s device',
    checkInIntervalSeconds: 86400,
    gracePeriodSeconds: 3600,
    label: 'For Bob',
    ...overrides,
});

const directory = () =>
    new Map<string, ReleaseIdentityDirectoryEntry>([
        ['me', entryFor(ALICE.identity.accountId, ALICE.identity)],
        [BOB.identity.accountId, entryFor(BOB.identity.accountId, BOB.identity)],
    ]);

beforeEach(() => setKemProvider(mlKem768Provider));
afterEach(() => setKemProvider(NULL_KEM_PROVIDER));

describe('armReleaseSwitch', () => {
    it('sends only the format, the timer, the label and an envelope Bob can open', async () => {
        const api = fakeApi(directory());
        const result = await createDeadmanReleaseActions(api.client).armReleaseSwitch(armInput());
        const [post] = api.sent();
        expect(post.path).toBe('/v1/deadman/switches');
        const body = post.body as DeadmanReleaseArmRequest;
        // What comes back: the server's event, and from the envelope built
        // here, the release id and whom it was sealed to, the owner first
        // (P3-H1, for the client's own record of each release's recipients).
        expect(result.armed).toEqual(SERVER_ARMED);
        expect(result.releaseId).toBe(body.envelope.releaseId);
        expect(result.releaseId).not.toBe('server-said');
        expect(result.sealedTo).toEqual([
            { accountId: ALICE.identity.accountId, fingerprint: ALICE.fingerprint },
            { accountId: BOB.identity.accountId, fingerprint: BOB.fingerprint },
        ]);
        expect(Object.keys(body).sort()).toEqual(
            ['checkInIntervalSeconds', 'envelope', 'format', 'gracePeriodSeconds', 'label'].sort()
        );
        expect(body.format).toBe('release-v1');
        expect(body.checkInIntervalSeconds).toBe(86400);
        const parsed = parseReleaseEnvelope(body.envelope);
        expect(parsed.ok).toBe(true);
        const copy = body.envelope.copies.find(
            (entry) => entry.recipientAccountId === BOB.identity.accountId
        );
        expect(
            await openReleaseCopy({
                header: releaseHeaderOf(body.envelope),
                copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: BOB.identity.accountId,
                keySets: [vectorKeySet(BOB)],
            })
        ).toMatchObject({ ok: true, text: 'Released words, sealed on the owner’s device' });
        // Neither the text nor any private key travels.
        const json = JSON.stringify(body);
        expect(json).not.toContain('Released words');
        expect(json).not.toContain(ALICE.signingPrivateJwk.d);
        expect(json).not.toContain(ALICE.x25519PrivateJwk.d);
        expect(json).not.toContain(ALICE.mlkem768SecretKey.slice(0, 40));
        // The directory was read fresh, for the owner and for Bob.
        expect(api.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
            'GET /v1/release-identities/me',
            `GET /v1/release-identities/${BOB.identity.accountId}`,
            'POST /v1/deadman/switches',
        ]);
    });

    it('leaves the label out when there is none', async () => {
        const api = fakeApi(directory());
        await createDeadmanReleaseActions(api.client).armReleaseSwitch(
            armInput({ label: undefined })
        );
        expect('label' in (api.sent()[0].body as object)).toBe(false);
    });

    describe('refuses before sending the envelope', () => {
        let bobNow: ReleaseKeySet;
        let aliceNow: ReleaseKeySet;
        beforeAll(async () => {
            setKemProvider(mlKem768Provider);
            bobNow = await createReleaseKeySet(BOB.identity.accountId);
            aliceNow = await createReleaseKeySet(ALICE.identity.accountId);
        });

        /** The refusal, with no envelope sent (the directory is read first); returns the error so its details can be checked. */
        const refusal = async (
            entries: Map<string, ReleaseIdentityDirectoryEntry>,
            input: Record<string, unknown>,
            code: string,
            state?: string
        ): Promise<ReleaseActionError> => {
            const api = fakeApi(entries);
            const attempt = createDeadmanReleaseActions(api.client).armReleaseSwitch(
                armInput(input)
            );
            await expect(attempt).rejects.toBeInstanceOf(ReleaseActionError);
            const error = await attempt.catch((cause: ReleaseActionError) => cause);
            expect(error.code).toBe(code);
            if (state) expect(error.state).toBe(state);
            expect(api.sent()).toEqual([]);
            return error as ReleaseActionError;
        };

        it('a recipient never compared with', async () => {
            const error = await refusal(
                directory(),
                { recipients: [{ accountId: BOB.identity.accountId, comparison: null }] },
                'recipient_comparison',
                'none'
            );
            // What the directory served is reported even so (P3-M3).
            expect(error.servedFingerprint).toBe(BOB.fingerprint);
        });

        it('a recipient whose directory identity is not the one compared, naming the key served', async () => {
            const entries = directory();
            entries.set(BOB.identity.accountId, entryFor(BOB.identity.accountId, bobNow.identity));
            const error = await refusal(entries, {}, 'recipient_comparison', 'stale');
            // The fingerprint this device computed from the served identity,
            // not the 'stated' one the entry carries, so the client can record
            // that it saw this key (H1's third clause, P3-M3).
            expect(error.accountId).toBe(BOB.identity.accountId);
            expect(error.servedFingerprint).toBe(bobNow.fingerprint);
            expect(error.servedFingerprint).not.toBe('stated');
        });

        it('a recipient whose compared identity the directory lists as replaced', async () => {
            const entries = directory();
            entries.set(
                BOB.identity.accountId,
                entryFor(BOB.identity.accountId, BOB.identity, [BOB.identity])
            );
            await refusal(entries, {}, 'recipient_comparison', 'stale');
        });

        it('a recipient shown as current again after this device saw a newer key', async () => {
            await refusal(
                directory(),
                {
                    recipients: [
                        {
                            accountId: BOB.identity.accountId,
                            comparison: bobComparison(),
                            seenSinceComparison: [bobNow.fingerprint],
                        },
                    ],
                },
                'recipient_comparison',
                'stale'
            );
        });

        it("a comparison made with another key of the owner's", async () => {
            await refusal(
                directory(),
                {
                    recipients: [
                        {
                            accountId: BOB.identity.accountId,
                            comparison: bobComparison({ ownFingerprint: bobNow.fingerprint }),
                        },
                    ],
                },
                'recipient_comparison',
                'stale'
            );
        });

        it('a recipient with no release identity', async () => {
            const entries = directory();
            entries.delete(BOB.identity.accountId);
            await refusal(entries, {}, 'recipient_identity');
        });

        it("an owner key the directory does not have, or lists another one than this device's", async () => {
            const unpublished = directory();
            unpublished.set('me', entryFor(ALICE.identity.accountId, null));
            await refusal(unpublished, {}, 'owner_key_not_published');
            // Another key of Alice's served as current: its computed fingerprint is reported (P3-M3).
            const other = directory();
            other.set('me', entryFor(ALICE.identity.accountId, aliceNow.identity));
            const error = await refusal(other, {}, 'owner_key_not_current');
            expect(error.accountId).toBe(ALICE.identity.accountId);
            expect(error.servedFingerprint).toBe(aliceNow.fingerprint);
            // An identity for another account served as Alice's verifies for
            // nobody, so nothing was served that counts.
            const strangers = directory();
            strangers.set('me', entryFor(ALICE.identity.accountId, BOB.identity));
            const nothing = await refusal(strangers, {}, 'owner_key_not_current');
            expect(nothing.servedFingerprint).toBeNull();
        });

        it('a directory answer that is not an entry, with the refusal the contract names and not a TypeError (the fourth reading)', async () => {
            // A hostile or buggy server answering a directory read with
            // something that is not an entry made the protocol function throw
            // a raw TypeError, which the SDK passed on. Each is now the
            // ReleaseActionError the contract promises, and no envelope is sent.
            const bobEntry = entryFor(BOB.identity.accountId, BOB.identity);
            for (const shape of [
                { ...bobEntry, superseded: undefined },
                { ...bobEntry, superseded: null },
                { ...bobEntry, superseded: 42 },
                { ...bobEntry, superseded: {} },
                { ...bobEntry, current: 'x' },
                'x',
            ]) {
                const entries = directory();
                entries.set(BOB.identity.accountId, shape as ReleaseIdentityDirectoryEntry);
                const error = await refusal(entries, {}, 'recipient_comparison', 'stale');
                expect(error.accountId).toBe(BOB.identity.accountId);
                // Nothing verified, so nothing was served that counts.
                expect(error.servedFingerprint).toBeNull();
            }
            // The owner's own entry, likewise.
            for (const shape of [
                null,
                'x',
                { ...entryFor(ALICE.identity.accountId, ALICE.identity), superseded: undefined },
            ]) {
                const entries = directory();
                entries.set('me', shape as ReleaseIdentityDirectoryEntry);
                await refusal(
                    entries,
                    {},
                    shape === null || shape === 'x'
                        ? 'owner_key_not_published'
                        : 'owner_key_not_current'
                );
            }
        });
    });
});

describe('resealRecipient', () => {
    it("opens the owner's own copy and sends one new copy, for Bob's new key", async () => {
        const envelope = await buildReleaseEnvelope({
            ownerKeySet: vectorKeySet(ALICE),
            recipients: [BOB.identity],
            message: 'Kept for Bob',
        });
        const bobNow = await createReleaseKeySet(BOB.identity.accountId);
        const entries = directory();
        entries.set(
            BOB.identity.accountId,
            entryFor(BOB.identity.accountId, bobNow.identity, [BOB.identity])
        );
        const owned = {
            switchId: envelope.releaseId,
            release: {
                header: releaseHeaderOf(envelope),
                ownerIdentity: ALICE.identity,
                ownCopy: envelope.copies[0],
                sealedTo: [],
            },
        };
        const api = fakeApi(entries, owned);
        await createDeadmanReleaseActions(api.client).resealRecipient(envelope.releaseId, {
            ownerKeySet: vectorKeySet(ALICE),
            recipient: {
                accountId: BOB.identity.accountId,
                comparison: bobComparison({ fingerprint: bobNow.fingerprint }),
            },
        });
        const [post] = api.sent();
        expect(post.path).toBe(`/v1/deadman/switches/${envelope.releaseId}/reseal`);
        const { copy } = post.body as { copy: { recipientFingerprint: string } };
        expect(Object.keys(post.body as object)).toEqual(['copy']);
        expect(copy.recipientFingerprint).toBe(bobNow.fingerprint);
        expect(
            await openReleaseCopy({
                header: releaseHeaderOf(envelope),
                copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: BOB.identity.accountId,
                keySets: [bobNow],
            })
        ).toMatchObject({ ok: true, text: 'Kept for Bob' });
    });

    it('refuses a switch that holds no release, and a stale comparison, sending no copy', async () => {
        const noRelease = fakeApi(directory(), { switchId: 'x' });
        await expect(
            createDeadmanReleaseActions(noRelease.client).resealRecipient('x', {
                ownerKeySet: vectorKeySet(ALICE),
                recipient: { accountId: BOB.identity.accountId, comparison: bobComparison() },
            })
        ).rejects.toMatchObject({ code: 'not_a_release' });
        expect(noRelease.sent()).toEqual([]);

        const envelope = await buildReleaseEnvelope({
            ownerKeySet: vectorKeySet(ALICE),
            recipients: [BOB.identity],
            message: 'x',
        });
        const owned = {
            switchId: envelope.releaseId,
            release: {
                header: releaseHeaderOf(envelope),
                ownerIdentity: ALICE.identity,
                ownCopy: envelope.copies[0],
                sealedTo: [],
            },
        };
        const stale = fakeApi(directory(), owned);
        await expect(
            createDeadmanReleaseActions(stale.client).resealRecipient(envelope.releaseId, {
                ownerKeySet: vectorKeySet(ALICE),
                recipient: { accountId: BOB.identity.accountId, comparison: null },
            })
        ).rejects.toMatchObject({ code: 'recipient_comparison' });
        expect(stale.sent()).toEqual([]);
    });

    it("refuses, before reading the directory or signing, an owner view that is another release's (P3-H1)", async () => {
        // Alice has release A to Bob and release B to Carol. A hostile server
        // answers GET /switches/A with B's header and B's own copy, both
        // genuine, hoping Alice's device seals B's key to Bob under her
        // signature. Nothing may be signed and no copy sent: the owner's view
        // is read first (that GET is what is being checked), and nothing after.
        const carol = await createReleaseKeySet('c1c2c3c4-d1d2-4e1e-af1f-a1a2a3a4a5a6');
        const releaseA = await buildReleaseEnvelope({
            ownerKeySet: vectorKeySet(ALICE),
            recipients: [BOB.identity],
            message: 'A: for Bob only',
        });
        const releaseB = await buildReleaseEnvelope({
            ownerKeySet: vectorKeySet(ALICE),
            recipients: [carol.identity],
            message: 'B: for Carol only, Bob must never read this',
        });
        const viewOf = (switchId: string, release: typeof releaseA) => ({
            switchId,
            ownerId: ALICE.identity.accountId,
            roomId: null,
            status: 'armed',
            recipients: [BOB.identity.accountId],
            release: {
                header: releaseHeaderOf(release),
                ownerIdentity: ALICE.identity,
                ownCopy: release.copies[0],
                sealedTo: [
                    {
                        recipientAccountId: BOB.identity.accountId,
                        recipientFingerprint: 'stale-looking',
                    },
                ],
            },
        });
        const reseal = (api: ReturnType<typeof fakeApi>) =>
            createDeadmanReleaseActions(api.client).resealRecipient(releaseA.releaseId, {
                ownerKeySet: vectorKeySet(ALICE),
                recipient: { accountId: BOB.identity.accountId, comparison: bobComparison() },
            });
        // A's switch id with B's release.
        const swapped = fakeApi(directory(), viewOf(releaseA.releaseId, releaseB));
        await expect(reseal(swapped)).rejects.toBeInstanceOf(ReleaseActionError);
        await expect(reseal(swapped)).rejects.toMatchObject({ code: 'release_mismatch' });
        expect(swapped.sent()).toEqual([]);
        // Refused on the view alone: the directory was not even read.
        expect(swapped.requests.map((request) => `${request.method} ${request.path}`)).toEqual(
            Array(2).fill(`GET /v1/deadman/switches/${releaseA.releaseId}`)
        );
        // Another switch's id with A's own release.
        const renamed = fakeApi(directory(), viewOf(releaseB.releaseId, releaseA));
        await expect(reseal(renamed)).rejects.toMatchObject({ code: 'release_mismatch' });
        expect(renamed.sent()).toEqual([]);
        // The honest view of A re-seals A.
        const honest = fakeApi(directory(), viewOf(releaseA.releaseId, releaseA));
        await reseal(honest);
        expect(honest.sent().map((request) => request.path)).toEqual([
            `/v1/deadman/switches/${releaseA.releaseId}/reseal`,
        ]);
    });
});

describe('the read calls', () => {
    it('list releases and read the limits at their paths', async () => {
        const api = fakeApi(directory());
        const actions = createDeadmanReleaseActions(api.client);
        expect(await actions.listReleases()).toEqual({ releases: [] });
        await actions.getLimits();
        expect(api.requests).toEqual([
            { method: 'GET', path: '/v1/deadman/releases' },
            { method: 'GET', path: '/v1/deadman/limits' },
        ]);
    });

    /** One honest released entry: Bob's copy of a release of Alice's, as the API lists it. */
    const releasedEntry = async () => {
        const envelope = await buildReleaseEnvelope({
            ownerKeySet: vectorKeySet(ALICE),
            recipients: [BOB.identity],
            message: 'x',
        });
        return {
            releaseId: envelope.releaseId,
            ownerAccountId: ALICE.identity.accountId,
            releasedAt: '2026-10-29T00:00:00.000Z',
            removesAt: '2027-10-29T00:00:00.000Z',
            header: releaseHeaderOf(envelope),
            ownerIdentity: ALICE.identity,
            copy: envelope.copies[1],
        };
    };
    const list = (entries: unknown) =>
        createDeadmanReleaseActions(fakeApi(directory(), undefined, entries).client).listReleases();

    it("refuses a released copy whose unsigned release id or owner differ from its header's, and an entry that is not one (P3-M2)", async () => {
        const released = await releasedEntry();
        // The honest entry comes back as it was.
        expect(await list({ releases: [released] })).toEqual({ releases: [released] });
        // The server names another owner, or another release, beside Alice's signed header.
        await expect(
            list({ releases: [{ ...released, ownerAccountId: BOB.identity.accountId }] })
        ).rejects.toMatchObject({ code: 'server_mismatch' });
        await expect(
            list({ releases: [released, { ...released, releaseId: 'another' }] })
        ).rejects.toMatchObject({ code: 'server_mismatch' });
        // An entry with no header, and an answer that is not a list.
        await expect(list({ releases: [{ ...released, header: null }] })).rejects.toMatchObject({
            code: 'server_mismatch',
        });
        await expect(list({})).rejects.toMatchObject({ code: 'server_mismatch' });
        // Entries that are not entries. Two absent ids are not an agreement:
        // each of these has no header id and no top-level id to differ, and
        // a check that only compared the two let them all through (the
        // second reading of P3-M2).
        const nonEntries: unknown[] = [
            null,
            {},
            'x',
            42,
            [],
            { header: {} },
            { header: { releaseId: undefined, ownerAccountId: undefined } },
            { ...released, header: undefined, releaseId: undefined, ownerAccountId: undefined },
            { ...released, header: { v: 1 }, releaseId: undefined, ownerAccountId: undefined },
            { ...released, header: [] },
            { ...released, header: { ...released.header, releaseId: 7 }, releaseId: 7 },
        ];
        for (const nonEntry of nonEntries) {
            await expect(list({ releases: [released, nonEntry] })).rejects.toMatchObject({
                code: 'server_mismatch',
            });
        }
    });

    it('refuses a released entry whose ids agree but are not of the id forms (the third reading of P3-M2)', async () => {
        const released = await releasedEntry();
        // Each of these agrees with itself, so a check that compared the two
        // sides alone passed it on. openReleaseCopy refuses such a header
        // later (release_id, account_id), but a client that keys or routes
        // by an entry's id before opening it would have carried these bytes.
        const upper = released.releaseId.toUpperCase();
        const withIds = (releaseId: string, ownerAccountId: string) => ({
            ...released,
            header: { ...released.header, releaseId, ownerAccountId },
            releaseId,
            ownerAccountId,
        });
        const malformed = [
            withIds('../x', released.ownerAccountId),
            withIds(upper, released.ownerAccountId),
            withIds(`${released.releaseId}\n`, released.ownerAccountId),
            withIds(released.releaseId, '<script>'),
            withIds(released.releaseId, ''),
            withIds(released.releaseId, `${released.ownerAccountId} `),
        ];
        for (const entry of malformed) {
            await expect(list({ releases: [released, entry] })).rejects.toMatchObject({
                code: 'server_mismatch',
            });
        }
        // The honest entry, whose ids are of their forms, still comes back as it was.
        expect(await list({ releases: [released] })).toEqual({ releases: [released] });
    });
});
