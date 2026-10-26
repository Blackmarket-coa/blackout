/**
 * The SDK's dead-man release calls (`createDeadmanReleaseActions`):
 * arming sends only the envelope, the timer and the label, and refuses, before
 * anything is sent, a recipient whose comparison does not count now (H1) and
 * an owner key the directory does not list as current; re-sealing opens the
 * owner's own copy and sends one new copy. Against a fake API.
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

/** A fake API: the directory as `entries` says, everything else recorded. */
const fakeApi = (entries: Map<string, ReleaseIdentityDirectoryEntry>, owned?: unknown) => {
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
        await createDeadmanReleaseActions(api.client).armReleaseSwitch(armInput());
        const [post] = api.sent();
        expect(post.path).toBe('/v1/deadman/switches');
        const body = post.body as DeadmanReleaseArmRequest;
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

    describe('refuses before sending anything', () => {
        let bobNow: ReleaseKeySet;
        beforeAll(async () => {
            setKemProvider(mlKem768Provider);
            bobNow = await createReleaseKeySet(BOB.identity.accountId);
        });

        const refusal = async (
            entries: Map<string, ReleaseIdentityDirectoryEntry>,
            input: Record<string, unknown>,
            code: string,
            state?: string
        ) => {
            const api = fakeApi(entries);
            const attempt = createDeadmanReleaseActions(api.client).armReleaseSwitch(
                armInput(input)
            );
            await expect(attempt).rejects.toBeInstanceOf(ReleaseActionError);
            await attempt.catch((error: ReleaseActionError) => {
                expect(error.code).toBe(code);
                if (state) expect(error.state).toBe(state);
            });
            expect(api.sent()).toEqual([]);
        };

        it('a recipient never compared with', async () => {
            await refusal(
                directory(),
                { recipients: [{ accountId: BOB.identity.accountId, comparison: null }] },
                'recipient_comparison',
                'none'
            );
        });

        it('a recipient whose directory identity is not the one compared', async () => {
            const entries = directory();
            entries.set(BOB.identity.accountId, entryFor(BOB.identity.accountId, bobNow.identity));
            await refusal(entries, {}, 'recipient_comparison', 'stale');
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
            const other = directory();
            other.set('me', entryFor(ALICE.identity.accountId, BOB.identity));
            await refusal(other, {}, 'owner_key_not_current');
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

    it('refuses a switch that holds no release, and a stale comparison, sending nothing', async () => {
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
});

describe('the read calls', () => {
    it('list releases and read the limits at their paths', async () => {
        const api = fakeApi(directory());
        const actions = createDeadmanReleaseActions(api.client);
        await actions.listReleases();
        await actions.getLimits();
        expect(api.requests).toEqual([
            { method: 'GET', path: '/v1/deadman/releases' },
            { method: 'GET', path: '/v1/deadman/limits' },
        ]);
    });
});
