/**
 * Dead-man switches in the release format, on the API
 * (`docs/security/release-envelope-2026-10-26.md` §6, §8, §11, §15): arming
 * behind BLACKOUT_DEADMAN_RELEASES with every check in order, re-sealing,
 * each recipient's read of their own copy after the trigger and nothing
 * before it, cancel, the removal after 365 days, limits, legacy switches
 * unchanged, and what account deletion and the export do. The envelopes are
 * built with the protocol as the owner's device builds them; the vectors'
 * Alice and Bob stand in for the owner and a recipient so the server checks
 * the very identities the client's known-answer tests pin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import type {
    DeadmanLimits,
    DeadmanReleasedCopy,
    DeadmanSwitchPayload,
    ReleaseCopy,
    ReleaseIdentity,
    ReleaseKeySet,
} from '@blackout/protocol';
import type { DeadmanSwitchRecord } from '../src/db/types';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
// Set inside this test process only: no deploy, compose or env file turns it on.
process.env.BLACKOUT_DEADMAN_RELEASES = '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const protocol = await import('@blackout/protocol');
const { ALICE, BOB } = await import('../../blackout-protocol/src/release/testVectors');
const {
    ARMING_UNAVAILABLE,
    ARMING_UNAVAILABLE_NO_SWEEP,
    RELEASE_ARM_MAX_BODY_BYTES,
    RELEASE_RESEAL_MAX_BODY_BYTES,
    recordToOwnerView,
    sweepOverdueDeadmanSwitches,
} = await import('../src/modules/deadman');
const { computeDeadlines } = await import('../src/services/deadmanScheduler');
const {
    DEADMAN_RELEASE_RETENTION_MS,
    blankReleaseWraps,
    heldReleaseSwitchCount,
    heldReleasesNaming,
    noticeCounts,
    removeExpiredReleases,
} = await import('../src/services/deadmanReleases');
const lifecycle = await import('../src/services/accountLifecycle');

// The API configures no KEM provider; only this test's own sealing needs one.
protocol.setKemProvider(protocol.mlKem768Provider);

type User = { id: string; username: string };

const seedUser = (id: string = randomUUID(), username?: string): User => {
    const name = username ?? `dr-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username: name,
        email: `${name}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username: name };
};

// The global limiter is per client address (120 a minute, no override); each
// account here calls from an address of its own so that the many arms below
// do not exhaust one budget.
const addressOf = (user: User): string =>
    `10.${Number.parseInt(user.id.slice(0, 2), 16)}.${Number.parseInt(
        user.id.slice(2, 4),
        16
    )}.${Number.parseInt(user.id.slice(4, 6), 16)}`;

const headers = (user: User, capabilityHeader?: string) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
    'content-type': 'application/json',
    'x-forwarded-for': addressOf(user),
    ...(capabilityHeader === undefined ? {} : { 'x-blackout-capabilities': capabilityHeader }),
});

const vectorKeySet = (person: typeof ALICE): ReleaseKeySet => ({
    identity: person.identity,
    fingerprint: person.fingerprint,
    signingPrivateJwk: person.signingPrivateJwk,
    x25519PrivateJwk: person.x25519PrivateJwk,
    mlkem768SecretKey: person.mlkem768SecretKey,
    createdAt: person.createdAt,
});

/** Publish a key set's identity to the directory, as PUT /release-identities/me would. */
const publish = (keySet: ReleaseKeySet) =>
    db.publishReleaseIdentity({
        id: randomUUID(),
        accountId: keySet.identity.accountId,
        formatVersion: keySet.identity.v,
        signingKey: keySet.identity.signingKey,
        x25519Key: keySet.identity.x25519Key,
        mlkem768Key: keySet.identity.mlkem768Key,
        signature: keySet.identity.signature,
        fingerprint: keySet.fingerprint,
    });

/** A fresh account with published release keys. */
const freshPerson = async (): Promise<{ user: User; keySet: ReleaseKeySet }> => {
    const user = seedUser();
    const keySet = await protocol.createReleaseKeySet(user.id);
    publish(keySet);
    return { user, keySet };
};

const MESSAGE = 'If you are reading this, open the blue folder. — synthetic test text';

const build = (ownerKeySet: ReleaseKeySet, recipients: ReleaseIdentity[], message = MESSAGE) =>
    protocol.buildReleaseEnvelope({ ownerKeySet, recipients, message });

const armBody = (envelope: unknown, overrides: Record<string, unknown> = {}) => ({
    format: 'release-v1',
    checkInIntervalSeconds: 60,
    gracePeriodSeconds: 0,
    label: 'the blue folder',
    envelope,
    ...overrides,
});

const arm = (user: User, body: unknown, capabilityHeader?: string) =>
    app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: headers(user, capabilityHeader),
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

const reseal = (user: User, switchId: string, body: unknown) =>
    app.request(`/v1/deadman/switches/${switchId}/reseal`, {
        method: 'POST',
        headers: headers(user),
        body: JSON.stringify(body),
    });

const releasesFor = async (user: User): Promise<DeadmanReleasedCopy[]> => {
    const res = await app.request('/v1/deadman/releases', { headers: headers(user) });
    assert.equal(res.status, 200);
    return ((await res.json()) as { releases: DeadmanReleasedCopy[] }).releases;
};

const ownerView = async (user: User, switchId: string): Promise<DeadmanSwitchPayload> => {
    const res = await app.request(`/v1/deadman/switches/${switchId}`, { headers: headers(user) });
    assert.equal(res.status, 200);
    return (await res.json()) as DeadmanSwitchPayload;
};

type ErrorBody = { code: string; message: string; reason?: string; recipientAccountId?: string };
const errorOf = async (res: Response, status: number, code: string): Promise<ErrorBody> => {
    const body = (await res.json()) as ErrorBody;
    assert.equal(res.status, status, `expected ${status} ${code}, got ${res.status} ${body.code}`);
    assert.equal(body.code, code);
    return body;
};

const tamperSignature = (copy: ReleaseCopy): ReleaseCopy => {
    const bytes = Buffer.from(copy.signature, 'base64');
    bytes[0] ^= 0x01;
    return { ...copy, signature: bytes.toString('base64') };
};

type Envelope = { event: string; roomId: unknown; senderId: string; payload: DeadmanSwitchPayload };

/** Fire every switch due by `at`, with no backlog window, as the sweep does on time. */
const sweepAt = (at: Date) => sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
const FIRES_AT = () => new Date(Date.now() + 200_000);

const seedLegacy = (owner: User, overrides: Partial<DeadmanSwitchRecord> = {}) => {
    const lastCheckInAt = new Date().toISOString();
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt,
        checkInIntervalSeconds: 60,
        gracePeriodSeconds: 0,
    });
    return db.createDeadmanSwitch({
        id: randomUUID(),
        ownerId: owner.id,
        roomId: '!room:example.org',
        status: 'armed',
        checkInIntervalSeconds: 60,
        gracePeriodSeconds: 0,
        lastCheckInAt,
        triggerAt,
        releaseAt,
        recipients: [],
        encryptedPayload: 'sealed-legacy-payload',
        headline: 'legacy label',
        ...overrides,
    });
};

// The vectors' accounts, published as they are.
const alice = seedUser(ALICE.identity.accountId, 'alice-vector');
const bob = seedUser(BOB.identity.accountId, 'bob-vector');
publish(vectorKeySet(ALICE));
publish(vectorKeySet(BOB));

test('with the flag off, arming is refused with 409 before the body is parsed and nothing is written; reads still answer', async () => {
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity]);
    delete process.env.BLACKOUT_DEADMAN_RELEASES;
    try {
        const before = db.deadmanSwitches.size;
        for (const body of [armBody(envelope), armBody({ broken: true }), 'not json']) {
            const res = await arm(alice, body);
            assert.equal(res.status, 409);
            assert.deepEqual(await res.json(), ARMING_UNAVAILABLE);
        }
        assert.equal(db.deadmanSwitches.size, before);
        assert.equal(db.getDeadmanSwitch(envelope.releaseId), undefined);
        assert.equal(db.listDeadmanReleaseWraps(envelope.releaseId).length, 0);

        // The scope is still checked first.
        const narrowed = await arm(alice, armBody(envelope), 'deadman.read');
        assert.equal(narrowed.status, 403);

        const limits = await app.request('/v1/deadman/limits', { headers: headers(alice) });
        assert.equal(limits.status, 200);
        const closed = (await limits.json()) as DeadmanLimits;
        assert.equal(closed.armingAvailable, false);
        assert.equal(closed.armingUnavailableReason, 'releases_off');
        assert.deepEqual(await releasesFor(bob), []);
    } finally {
        process.env.BLACKOUT_DEADMAN_RELEASES = '1';
    }
    // On for 1 or true in any casing, surrounding whitespace ignored; off for
    // anything else (`yes`, `on`). A broken body shows the flag was passed
    // (400, not 409) without arming anything.
    for (const [spelling, status] of [
        ['yes', 409],
        ['on', 409],
        ['TRUE', 400],
        [' true ', 400],
        ['1 ', 400],
    ] as const) {
        process.env.BLACKOUT_DEADMAN_RELEASES = spelling;
        try {
            assert.equal(
                (await arm(alice, armBody({ broken: true }))).status,
                status,
                `flag ${JSON.stringify(spelling)}`
            );
        } finally {
            process.env.BLACKOUT_DEADMAN_RELEASES = '1';
        }
    }
});

test('with the sweep switched off in the API’s own environment, arming is refused with 409 and /limits says why', async () => {
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity]);
    process.env.BLACKOUT_DEADMAN_SWEEP = '0';
    try {
        const res = await arm(alice, armBody(envelope));
        assert.equal(res.status, 409);
        assert.deepEqual(await res.json(), ARMING_UNAVAILABLE_NO_SWEEP);
        assert.equal(db.getDeadmanSwitch(envelope.releaseId), undefined);
        const limits = (await (
            await app.request('/v1/deadman/limits', { headers: headers(alice) })
        ).json()) as DeadmanLimits;
        assert.equal(limits.armingAvailable, false);
        assert.equal(limits.armingUnavailableReason, 'sweep_off');
        // The flag comes first: with both off, the reason is the flag.
        delete process.env.BLACKOUT_DEADMAN_RELEASES;
        try {
            assert.deepEqual(
                await (await arm(alice, armBody(envelope))).json(),
                ARMING_UNAVAILABLE
            );
            const both = (await (
                await app.request('/v1/deadman/limits', { headers: headers(alice) })
            ).json()) as DeadmanLimits;
            assert.equal(both.armingUnavailableReason, 'releases_off');
        } finally {
            process.env.BLACKOUT_DEADMAN_RELEASES = '1';
        }
    } finally {
        delete process.env.BLACKOUT_DEADMAN_SWEEP;
    }
    // Any other value, the default included, leaves arming open.
    process.env.BLACKOUT_DEADMAN_SWEEP = '1';
    try {
        const limits = (await (
            await app.request('/v1/deadman/limits', { headers: headers(alice) })
        ).json()) as DeadmanLimits;
        assert.equal(limits.armingAvailable, true);
        assert.equal(limits.armingUnavailableReason, undefined);
    } finally {
        delete process.env.BLACKOUT_DEADMAN_SWEEP;
    }
});

test('with the flag on, an owner arms a release switch: the row, one copy per account, and an owner view that holds only the owner’s copy', async () => {
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity]);
    // The copies are written before the switch, so a crash between the two
    // leaves copies no switch names rather than a switch without copies.
    const realCreate = db.createDeadmanSwitch.bind(db);
    let wrapsAtSwitchWrite = -1;
    db.createDeadmanSwitch = ((input: Parameters<typeof db.createDeadmanSwitch>[0]) => {
        wrapsAtSwitchWrite = db.listDeadmanReleaseWraps(input.id).length;
        return realCreate(input);
    }) as typeof db.createDeadmanSwitch;
    let res: Response;
    try {
        res = await arm(alice, armBody(envelope));
    } finally {
        db.createDeadmanSwitch = realCreate;
    }
    assert.equal(res.status, 201);
    assert.equal(
        wrapsAtSwitchWrite,
        2,
        'both copies were in the store when the switch was written'
    );
    const body = (await res.json()) as Envelope;
    assert.equal(body.event, 'blackout.deadman.switch.armed');
    assert.equal(body.roomId, null);
    assert.equal(body.senderId, alice.id);
    const view = body.payload;
    assert.equal(view.switchId, envelope.releaseId, 'the release id is the switch id');
    assert.equal(view.ownerId, alice.id);
    assert.equal(view.roomId, null);
    assert.equal(view.status, 'armed');
    assert.equal(view.releaseFormat, 'release-v1');
    assert.equal(view.releasedAt, undefined);
    assert.equal(view.notices, undefined);
    assert.equal(view.headline, 'the blue folder');
    assert.deepEqual(view.recipients, [bob.id]);
    assert.equal(view.encryptedPayload, undefined, 'what the row keeps is never sent as a payload');
    assert.equal(view.checkInIntervalSeconds, 60);
    assert.equal(view.gracePeriodSeconds, 0);
    assert.ok(view.release, 'the owner view carries the release while it is held');
    const { copies, ...header } = envelope;
    assert.deepEqual(view.release?.header, header);
    assert.deepEqual(view.release?.ownerIdentity, ALICE.identity);
    const aliceCopy = copies.find((c) => c.recipientAccountId === alice.id)!;
    const bobCopy = copies.find((c) => c.recipientAccountId === bob.id)!;
    assert.deepEqual(view.release?.ownCopy, aliceCopy);
    assert.deepEqual(view.release?.sealedTo, [
        { recipientAccountId: bob.id, recipientFingerprint: BOB.fingerprint },
    ]);
    const text = JSON.stringify(body);
    assert.ok(
        !text.includes(bobCopy.sealedKey),
        "nobody's copy but the owner's is in the owner view"
    );
    assert.ok(!text.includes(bobCopy.signature));
    assert.ok(protocol.isDeadmanSwitchArmed(body), 'the envelope is a valid armed event');

    const record = db.getDeadmanSwitch(envelope.releaseId)!;
    assert.equal(record.roomId, undefined);
    assert.equal(record.releaseFormat, 'release-v1');
    assert.deepEqual(JSON.parse(record.encryptedPayload), {
        header,
        ownerIdentity: ALICE.identity,
    });
    const wraps = db.listDeadmanReleaseWraps(envelope.releaseId);
    assert.equal(wraps.length, 2);
    for (const copy of copies) {
        const wrap = db.getDeadmanReleaseWrap(envelope.releaseId, copy.recipientAccountId)!;
        assert.equal(wrap.recipientFingerprint, copy.recipientFingerprint);
        assert.equal(wrap.sealedKey, copy.sealedKey);
        assert.equal(wrap.signature, copy.signature);
    }

    // The same view by GET, in the list, and nothing of it for Bob yet.
    assert.deepEqual(await ownerView(alice, envelope.releaseId), view);
    const listed = await app.request('/v1/deadman/switches', { headers: headers(alice) });
    const entries = ((await listed.json()) as { switches: DeadmanSwitchPayload[] }).switches;
    assert.ok(entries.some((e) => e.switchId === envelope.releaseId));
    assert.equal(
        (await app.request(`/v1/deadman/switches/${envelope.releaseId}`, { headers: headers(bob) }))
            .status,
        404
    );
    assert.deepEqual(await releasesFor(bob), [], 'nothing is released before the trigger');
    const bobList = await app.request('/v1/deadman/switches?scope=recipient', {
        headers: headers(bob),
    });
    assert.ok(!JSON.stringify(await bobList.json()).includes(envelope.releaseId));

    // Replay: the release id is taken.
    await errorOf(await arm(alice, armBody(envelope)), 409, 'release_id_taken');
    assert.equal(db.listDeadmanReleaseWraps(envelope.releaseId).length, 2);
});

test('the body is checked for its shape before anything else: the legacy body, a missing format and a roomId are refused', async () => {
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity]);
    for (const body of [
        {
            roomId: '!room:example.org',
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 600,
            recipients: [bob.id],
            encryptedPayload: 'sealed-payload',
        },
        armBody(envelope, { format: undefined }),
        armBody(envelope, { format: 'legacy' }),
        armBody(envelope, { roomId: '!room:example.org' }),
        armBody(envelope, { recipients: [bob.id] }),
        armBody(envelope, { checkInIntervalSeconds: '60' }),
        armBody(envelope, { checkInIntervalSeconds: 60.5 }),
        armBody(envelope, { envelope: 'not an object' }),
    ]) {
        await errorOf(await arm(alice, body), 400, 'invalid_request');
    }
    assert.equal(db.getDeadmanSwitch(envelope.releaseId), undefined);

    // Over the route's body cap: refused by the cap's middleware, which runs first.
    const huge = await arm(
        alice,
        armBody(envelope, { label: 'x'.repeat(RELEASE_ARM_MAX_BODY_BYTES) })
    );
    await errorOf(huge, 413, 'payload_too_large');
});

test('the envelope’s form, the owner, the bounds, the identities and the signatures are checked, in that order', async () => {
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity]);

    // The envelope's own validator, with its reason.
    const malformed = await errorOf(
        await arm(alice, armBody({ ...envelope, v: 2 })),
        400,
        'invalid_release_envelope'
    );
    assert.equal(malformed.reason, 'version');
    const { copies: _copies, ...noCopies } = envelope;
    assert.equal(
        (await errorOf(await arm(alice, armBody(noCopies)), 400, 'invalid_release_envelope'))
            .reason,
        'shape'
    );
    const noOwnerCopy = {
        ...envelope,
        copies: envelope.copies.filter((c) => c.recipientAccountId !== alice.id),
    };
    assert.equal(
        (await errorOf(await arm(alice, armBody(noOwnerCopy)), 400, 'invalid_release_envelope'))
            .reason,
        'copies'
    );

    // Someone else's envelope: refused as not theirs, before any signature is looked at.
    await errorOf(await arm(bob, armBody(envelope)), 403, 'release_not_yours');
    const tampered = {
        ...envelope,
        copies: envelope.copies.map((c) =>
            c.recipientAccountId === bob.id ? tamperSignature(c) : c
        ),
    };
    await errorOf(await arm(bob, armBody(tampered)), 403, 'release_not_yours');
    // A malformed envelope is refused as malformed even when it is not theirs.
    await errorOf(await arm(bob, armBody({ ...envelope, v: 2 })), 400, 'invalid_release_envelope');

    // The timer and the label.
    for (const [overrides, mentions] of [
        [{ checkInIntervalSeconds: 59 }, /checkInIntervalSeconds/],
        [{ checkInIntervalSeconds: 60 * 60 * 24 * 365 + 1 }, /checkInIntervalSeconds/],
        [{ gracePeriodSeconds: -1 }, /gracePeriodSeconds/],
        [{ gracePeriodSeconds: 60 * 60 * 24 * 30 + 1 }, /gracePeriodSeconds/],
        [{ label: 'x'.repeat(281) }, /label/],
    ] as const) {
        const refused = await errorOf(
            await arm(alice, armBody(envelope, overrides)),
            400,
            'invalid_request'
        );
        assert.match(refused.message, mentions);
    }
    // The bounds are checked before the owner's identity is.
    const nobody = seedUser();
    const nobodyKeys = await protocol.createReleaseKeySet(nobody.id);
    const nobodyEnvelope = await build(nobodyKeys, [BOB.identity]);
    await errorOf(
        await arm(nobody, armBody(nobodyEnvelope, { checkInIntervalSeconds: 1 })),
        400,
        'invalid_request'
    );
    // Then the owner's identity: none published.
    await errorOf(await arm(nobody, armBody(nobodyEnvelope)), 409, 'owner_identity_missing');
    // Published, then replaced since the envelope was sealed.
    const changing = await freshPerson();
    const staleEnvelope = await build(changing.keySet, [BOB.identity]);
    publish(await protocol.createReleaseKeySet(changing.user.id));
    await errorOf(await arm(changing.user, armBody(staleEnvelope)), 409, 'owner_identity_changed');

    // Recipients: no such account; an account without an identity; an
    // identity the account replaced; one it never published.
    const ghostKeys = await protocol.createReleaseKeySet(randomUUID());
    const ghost = await errorOf(
        await arm(alice, armBody(await build(vectorKeySet(ALICE), [ghostKeys.identity]))),
        400,
        'unknown_recipient'
    );
    assert.equal(ghost.recipientAccountId, ghostKeys.identity.accountId);
    const keyless = seedUser();
    const keylessKeys = await protocol.createReleaseKeySet(keyless.id);
    const noIdentity = await errorOf(
        await arm(alice, armBody(await build(vectorKeySet(ALICE), [keylessKeys.identity]))),
        400,
        'unknown_recipient'
    );
    assert.equal(noIdentity.recipientAccountId, keyless.id);
    const replaced = await freshPerson();
    const toOldKey = await build(vectorKeySet(ALICE), [BOB.identity, replaced.keySet.identity]);
    publish(await protocol.createReleaseKeySet(replaced.user.id));
    const superseded = await errorOf(
        await arm(alice, armBody(toOldKey)),
        409,
        'recipient_identity_superseded'
    );
    assert.equal(superseded.recipientAccountId, replaced.user.id);
    const other = await freshPerson();
    const neverPublished = await protocol.createReleaseKeySet(other.user.id);
    const toUnknownKey = await build(vectorKeySet(ALICE), [neverPublished.identity]);
    const unknownKey = await errorOf(
        await arm(alice, armBody(toUnknownKey)),
        400,
        'recipient_identity_unknown'
    );
    assert.equal(unknownKey.recipientAccountId, other.user.id);

    // The signatures, last: a copy signed over other bytes.
    const badSignature = await errorOf(
        await arm(alice, armBody(tampered)),
        400,
        'invalid_release_signature'
    );
    assert.equal(badSignature.recipientAccountId, bob.id);
    // A copy re-signed with another key, the owner's fields kept.
    const impostor = await protocol.createReleaseKeySet(alice.id);
    const forged = await protocol.buildReleaseEnvelope({
        ownerKeySet: impostor,
        recipients: [BOB.identity],
        message: MESSAGE,
        releaseId: envelope.releaseId,
    });
    // The forged envelope names the impostor's fingerprint, which is not the
    // directory's current one for Alice.
    await errorOf(await arm(alice, armBody(forged)), 409, 'owner_identity_changed');
    const spliced = { ...forged, ownerFingerprint: ALICE.fingerprint };
    await errorOf(await arm(alice, armBody(spliced)), 400, 'invalid_release_envelope');

    // None of it wrote anything.
    for (const id of [
        envelope.releaseId,
        nobodyEnvelope.releaseId,
        staleEnvelope.releaseId,
        toOldKey.releaseId,
        toUnknownKey.releaseId,
    ]) {
        assert.equal(db.getDeadmanSwitch(id), undefined, `${id} was not armed`);
        assert.equal(db.listDeadmanReleaseWraps(id).length, 0);
    }
});

/** Move an owner's arms out of the 24-hour window, so the next test step is about another bound. */
const backdateArms = (ownerId: string, byMs = 25 * 3600 * 1000) => {
    for (const record of db.listDeadmanSwitchesForOwner(ownerId)) {
        db.deadmanSwitches.set(record.id, {
            ...record,
            createdAt: new Date(Date.parse(record.createdAt) - byMs).toISOString(),
        });
    }
};

/** What the store holds for one owner's release switches: content and copies, in bytes. */
const heldBytes = (ownerId: string) => {
    let content = 0;
    let copies = 0;
    for (const record of db.listDeadmanSwitchesForOwner(ownerId)) {
        content += record.encryptedPayload.length;
        for (const wrap of db.listDeadmanReleaseWraps(record.id)) {
            copies += wrap.sealedKey.length + wrap.signature.length;
        }
    }
    return { content, copies };
};

test('at most 10 release arms in any 24 hours: the 11th is 429 with Retry-After, and fits again a day after the first', async () => {
    const owner = await freshPerson();
    const people = [await freshPerson(), await freshPerson()];
    for (let i = 0; i < 10; i += 1) {
        const envelope = await build(owner.keySet, [people[i % 2].keySet.identity], `m ${i}`);
        assert.equal((await arm(owner.user, armBody(envelope))).status, 201, `arm ${i}`);
    }
    const eleventh = await build(owner.keySet, [people[0].keySet.identity]);
    const refused = await arm(owner.user, armBody(eleventh));
    const body = await errorOf(refused, 429, 'release_arm_rate_limited');
    const retryAfter = (body as unknown as { retryAfterSeconds: number }).retryAfterSeconds;
    assert.ok(retryAfter > 23 * 3600 && retryAfter <= 24 * 3600, `about a day: ${retryAfter}`);
    assert.equal(refused.headers.get('retry-after'), String(retryAfter));
    assert.equal(db.getDeadmanSwitch(eleventh.releaseId), undefined);
    assert.equal(db.listDeadmanReleaseWraps(eleventh.releaseId).length, 0);
    // A cancelled arm still counts: the arm happened.
    const [first] = db.listDeadmanSwitchesForOwner(owner.user.id);
    await app.request(`/v1/deadman/switches/${first.id}/cancel`, {
        method: 'POST',
        headers: headers(owner.user),
    });
    await errorOf(await arm(owner.user, armBody(eleventh)), 429, 'release_arm_rate_limited');
    // Once the first arm is more than a day old, one more fits, and only one.
    db.deadmanSwitches.set(first.id, {
        ...db.getDeadmanSwitch(first.id)!,
        createdAt: new Date(Date.now() - 24 * 3600 * 1000 - 1000).toISOString(),
    });
    assert.equal((await arm(owner.user, armBody(eleventh))).status, 201);
    const twelfth = await build(owner.keySet, [people[1].keySet.identity]);
    await errorOf(await arm(owner.user, armBody(twelfth)), 429, 'release_arm_rate_limited');
});

test('at most 20 release switches per owner with content held: fired ones count until their removal, cancelled and legacy ones do not, and held bytes stop growing', async () => {
    const owner = await freshPerson();
    // Four people, five switches each: under the per-recipient bound.
    const people = [
        await freshPerson(),
        await freshPerson(),
        await freshPerson(),
        await freshPerson(),
    ];
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
        const envelope = await build(owner.keySet, [people[i % 4].keySet.identity], `message ${i}`);
        // One of them with a long timer, so it is still armed when the rest fire.
        const overrides = i === 0 ? { checkInIntervalSeconds: 3600 } : {};
        assert.equal((await arm(owner.user, armBody(envelope, overrides))).status, 201, `arm ${i}`);
        ids.push(envelope.releaseId);
        if (i === 9) backdateArms(owner.user.id);
    }
    backdateArms(owner.user.id);
    const oneMore = await build(owner.keySet, [people[0].keySet.identity]);
    await errorOf(await arm(owner.user, armBody(oneMore)), 409, 'release_switch_limit');
    assert.equal(db.getDeadmanSwitch(oneMore.releaseId), undefined);
    assert.equal(db.listDeadmanReleaseWraps(oneMore.releaseId).length, 0);

    // The sweep fires 19 of them: their content is still held, so they still count.
    const firesAt = FIRES_AT();
    sweepAt(firesAt);
    assert.equal(
        ids.slice(1).filter((id) => db.getDeadmanSwitch(id)?.status === 'triggered').length,
        19
    );
    assert.equal(db.getDeadmanSwitch(ids[0])?.status, 'armed');
    const before = heldBytes(owner.user.id);
    await errorOf(await arm(owner.user, armBody(oneMore)), 409, 'release_switch_limit');
    for (let round = 0; round < 5; round += 1) {
        const again = await build(
            owner.keySet,
            [people[round % 4].keySet.identity],
            `again ${round}`
        );
        await errorOf(await arm(owner.user, armBody(again)), 409, 'release_switch_limit');
    }
    assert.deepEqual(heldBytes(owner.user.id), before, 'nothing more is held');
    assert.ok(before.content > 19 * 1000, 'the fired switches’ content is what is held');

    // Cancelling the armed one frees its slot: cancel blanks its content.
    const cancel = await app.request(`/v1/deadman/switches/${ids[0]}/cancel`, {
        method: 'POST',
        headers: headers(owner.user),
    });
    assert.equal(cancel.status, 200);
    assert.equal((await arm(owner.user, armBody(oneMore))).status, 201);
    backdateArms(owner.user.id);
    const yetAnother = await build(owner.keySet, [people[1].keySet.identity]);
    await errorOf(await arm(owner.user, armBody(yetAnother)), 409, 'release_switch_limit');

    // The 365-day removal frees the fired ones' slots.
    sweepAt(new Date(firesAt.getTime() + DEADMAN_RELEASE_RETENTION_MS));
    assert.equal(db.getDeadmanSwitch(ids[1])?.encryptedPayload, '');
    assert.equal((await arm(owner.user, armBody(yetAnother))).status, 201);

    // Legacy switches do not count against it.
    const legacyOwner = await freshPerson();
    for (let i = 0; i < 25; i += 1) seedLegacy(legacyOwner.user);
    const legacyEnvelope = await build(legacyOwner.keySet, [BOB.identity]);
    assert.equal((await arm(legacyOwner.user, armBody(legacyEnvelope))).status, 201);
});

test('at most 5 held releases from one owner may name one person, and 50 from everyone; one code for both', async () => {
    const owner = await freshPerson();
    const victim = await freshPerson();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
        const envelope = await build(owner.keySet, [victim.keySet.identity], `named ${i}`);
        assert.equal((await arm(owner.user, armBody(envelope))).status, 201, `arm ${i}`);
        ids.push(envelope.releaseId);
    }
    const sixth = await build(owner.keySet, [victim.keySet.identity, BOB.identity]);
    const refused = await errorOf(await arm(owner.user, armBody(sixth)), 409, 'recipient_limit');
    assert.equal(refused.recipientAccountId, victim.user.id);
    assert.equal(db.getDeadmanSwitch(sixth.releaseId), undefined);
    assert.equal(db.listDeadmanReleaseWraps(sixth.releaseId).length, 0);
    // A cancelled one does not count: its copies are blank.
    assert.equal(
        (
            await app.request(`/v1/deadman/switches/${ids[4]}/cancel`, {
                method: 'POST',
                headers: headers(owner.user),
            })
        ).status,
        200
    );
    const replacement = await build(owner.keySet, [victim.keySet.identity], 'replacement');
    assert.equal((await arm(owner.user, armBody(replacement))).status, 201);
    await errorOf(await arm(owner.user, armBody(sixth)), 409, 'recipient_limit');
    // Fired ones count until their removal.
    sweepAt(FIRES_AT());
    assert.equal(db.getDeadmanSwitch(ids[0])?.status, 'triggered');
    await errorOf(await arm(owner.user, armBody(sixth)), 409, 'recipient_limit');
    // Another owner may still name them: the bound is per owner here.
    const another = await freshPerson();
    assert.equal(
        (await arm(another.user, armBody(await build(another.keySet, [victim.keySet.identity]))))
            .status,
        201
    );
    // A copy for the owner's own account is not "naming" anyone: the owner can
    // arm for other people while at the bound for this one.
    assert.equal(
        (await arm(owner.user, armBody(await build(owner.keySet, [BOB.identity])))).status,
        201
    );

    // From everyone: ten owners, five each, name one person; the 51st is refused
    // with the same code and message, so the answer does not say which bound.
    const popular = await freshPerson();
    for (let o = 0; o < 10; o += 1) {
        const namer = await freshPerson();
        for (let i = 0; i < 5; i += 1) {
            const envelope = await build(namer.keySet, [popular.keySet.identity], `p ${o} ${i}`);
            assert.equal((await arm(namer.user, armBody(envelope))).status, 201, `${o}/${i}`);
        }
    }
    const eleventhOwner = await freshPerson();
    const fiftyFirst = await errorOf(
        await arm(
            eleventhOwner.user,
            armBody(await build(eleventhOwner.keySet, [popular.keySet.identity]))
        ),
        409,
        'recipient_limit'
    );
    assert.equal(fiftyFirst.recipientAccountId, popular.user.id);
    assert.equal(fiftyFirst.message, refused.message);
    assert.deepEqual(Object.keys(fiftyFirst).sort(), Object.keys(refused).sort());
    // Someone else is still free to be named by that owner.
    assert.equal(
        (await arm(eleventhOwner.user, armBody(await build(eleventhOwner.keySet, [BOB.identity]))))
            .status,
        201
    );
});

/** Arm every envelope at once, as a hostile client would; the answers tallied by status and code. */
const burst = async (
    arms: Array<{ owner: User; envelope: Awaited<ReturnType<typeof build>> }>
): Promise<{ tally: Record<string, number>; refused: ErrorBody[] }> => {
    const responses = await Promise.all(
        arms.map(async ({ owner, envelope }) => ({
            envelope,
            res: await arm(owner, armBody(envelope)),
        }))
    );
    const tally: Record<string, number> = {};
    const refused: ErrorBody[] = [];
    for (const { envelope, res } of responses) {
        let key = '201';
        if (res.status !== 201) {
            const body = (await res.json()) as ErrorBody;
            refused.push(body);
            key = `${res.status} ${body.code}`;
            assert.equal(db.getDeadmanSwitch(envelope.releaseId), undefined, 'nothing written');
            assert.equal(db.listDeadmanReleaseWraps(envelope.releaseId).length, 0);
        }
        tally[key] = (tally[key] ?? 0) + 1;
    }
    return { tally, refused };
};

test('arms sent at once at the edge of each bound: exactly the bound passes and the rest are refused with its code', async () => {
    // Every bound is read before the signatures are verified and again right
    // before the rows are written, with nothing yielding between the second
    // read and the writes. Without the second read, a burst of arms that all
    // passed the first read against the same counts all write (round 2 of the
    // independent review of part 2: 30 at once from one owner armed 30 against
    // a rate of 10 and a cap of 20; 100 at once naming one person armed 100
    // against a bound of 5). The sequential tests above cannot see that.

    // The rate: 30 at once from a fresh owner, six people so that no
    // per-recipient bound is reached first.
    const owner = await freshPerson();
    const people: Awaited<ReturnType<typeof freshPerson>>[] = [];
    for (let i = 0; i < 6; i += 1) people.push(await freshPerson());
    const rateArms = [];
    for (let i = 0; i < 30; i += 1) {
        rateArms.push({
            owner: owner.user,
            envelope: await build(owner.keySet, [people[i % 6].keySet.identity], `rate ${i}`),
        });
    }
    const rate = await burst(rateArms);
    assert.deepEqual(rate.tally, { '201': 10, '429 release_arm_rate_limited': 20 });
    assert.equal(heldReleaseSwitchCount(owner.user.id), 10);

    // The held cap: an owner at 19 (sequentially, arms backdated out of the
    // rate window), then 15 at once naming the one person with room left.
    const capped = await freshPerson();
    const four = [people[0], people[1], people[2], people[3]];
    for (let i = 0; i < 19; i += 1) {
        const envelope = await build(capped.keySet, [four[i % 4].keySet.identity], `held ${i}`);
        assert.equal((await arm(capped.user, armBody(envelope))).status, 201, `arm ${i}`);
        if (i === 9) backdateArms(capped.user.id);
    }
    backdateArms(capped.user.id);
    const capArms = [];
    for (let i = 0; i < 15; i += 1) {
        capArms.push({
            owner: capped.user,
            envelope: await build(capped.keySet, [four[3].keySet.identity], `cap ${i}`),
        });
    }
    const cap = await burst(capArms);
    assert.deepEqual(cap.tally, { '201': 1, '409 release_switch_limit': 14 });
    assert.equal(heldReleaseSwitchCount(capped.user.id), 20);

    // Naming one person from one owner: 15 at once.
    const namer = await freshPerson();
    const victim = await freshPerson();
    const nameArms = [];
    for (let i = 0; i < 15; i += 1) {
        nameArms.push({
            owner: namer.user,
            envelope: await build(namer.keySet, [victim.keySet.identity], `name ${i}`),
        });
    }
    const named = await burst(nameArms);
    assert.deepEqual(named.tally, { '201': 5, '409 recipient_limit': 10 });
    assert.ok(named.refused.every((body) => body.recipientAccountId === victim.user.id));
    assert.equal(heldReleasesNaming(victim.user.id).total, 5);

    // Naming one person from everyone: at 45 from nine owners, ten more owners
    // arm at once; the bound spans owners, so only the second read can hold it.
    const popular = await freshPerson();
    for (let o = 0; o < 9; o += 1) {
        const one = await freshPerson();
        for (let i = 0; i < 5; i += 1) {
            const envelope = await build(one.keySet, [popular.keySet.identity], `p ${o} ${i}`);
            assert.equal((await arm(one.user, armBody(envelope))).status, 201, `${o}/${i}`);
        }
    }
    assert.equal(heldReleasesNaming(popular.user.id).total, 45);
    const allArms = [];
    for (let o = 0; o < 10; o += 1) {
        const one = await freshPerson();
        allArms.push({
            owner: one.user,
            envelope: await build(one.keySet, [popular.keySet.identity], `all ${o}`),
        });
    }
    const all = await burst(allArms);
    assert.deepEqual(all.tally, { '201': 5, '409 recipient_limit': 5 });
    assert.equal(heldReleasesNaming(popular.user.id).total, 50);
});

test('after the trigger each recipient reads their own copy and nothing of anyone else’s; the owner and strangers read none; the legacy views never list it', async () => {
    const carol = await freshPerson();
    const stranger = seedUser();
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity, carol.keySet.identity]);
    assert.equal((await arm(alice, armBody(envelope))).status, 201);
    const bobCopy = envelope.copies.find((c) => c.recipientAccountId === bob.id)!;
    const carolCopy = envelope.copies.find((c) => c.recipientAccountId === carol.user.id)!;

    // Bob is named on other tests' switches too, so his list is filtered by id.
    const bobsRelease = async () =>
        (await releasesFor(bob)).filter((r) => r.releaseId === envelope.releaseId);
    assert.deepEqual(await bobsRelease(), []);
    assert.deepEqual(await releasesFor(carol.user), []);

    const firesAt = FIRES_AT();
    assert.ok(sweepAt(firesAt) >= 1);
    const record = db.getDeadmanSwitch(envelope.releaseId)!;
    assert.equal(record.status, 'triggered');
    assert.equal(record.releasedAt, firesAt.toISOString());

    const bobs = await bobsRelease();
    assert.equal(bobs.length, 1);
    const [release] = bobs;
    assert.equal(release.releaseId, envelope.releaseId);
    assert.equal(release.ownerAccountId, alice.id);
    assert.equal(release.releasedAt, firesAt.toISOString());
    assert.equal(
        release.removesAt,
        new Date(firesAt.getTime() + DEADMAN_RELEASE_RETENTION_MS).toISOString()
    );
    const { copies: _copies, ...header } = envelope;
    assert.deepEqual(release.header, header);
    assert.deepEqual(release.ownerIdentity, ALICE.identity);
    assert.deepEqual(release.copy, bobCopy);
    assert.deepEqual(Object.keys(release).sort(), [
        'copy',
        'header',
        'ownerAccountId',
        'ownerIdentity',
        'releaseId',
        'releasedAt',
        'removesAt',
    ]);
    const bobsText = JSON.stringify(bobs);
    assert.ok(!bobsText.includes(carol.user.id), 'a recipient does not learn who else was named');
    assert.ok(!bobsText.includes(carolCopy.sealedKey));
    assert.ok(!bobsText.includes('the blue folder'), 'the label is the owner’s');
    const aliceCopy = envelope.copies.find((c) => c.recipientAccountId === alice.id)!;
    assert.ok(!bobsText.includes(aliceCopy.sealedKey), "the owner's own copy goes to nobody");

    // Bob opens it with his keys, as the app does.
    const opened = await protocol.openReleaseCopy({
        header: release.header,
        copy: release.copy,
        ownerIdentity: release.ownerIdentity,
        recipientAccountId: bob.id,
        keySets: [vectorKeySet(BOB)],
    });
    assert.equal(opened.ok, true);
    assert.equal(opened.ok && opened.text, MESSAGE);

    const carols = await releasesFor(carol.user);
    assert.equal(carols.length, 1);
    assert.deepEqual(carols[0].copy, carolCopy);
    assert.ok(!JSON.stringify(carols).includes(bob.id));

    assert.deepEqual(await releasesFor(alice), [], 'the owner is not given their own release');
    assert.deepEqual(await releasesFor(stranger), []);

    // The legacy recipient views never show a release switch: a recipient
    // gets the same 404 as a stranger, and the list leaves it out.
    for (const who of [bob, carol.user, stranger]) {
        const read = await app.request(`/v1/deadman/switches/${envelope.releaseId}`, {
            headers: headers(who),
        });
        assert.equal(read.status, 404);
        const list = await app.request('/v1/deadman/switches?scope=recipient', {
            headers: headers(who),
        });
        assert.ok(!JSON.stringify(await list.json()).includes(envelope.releaseId));
    }

    // The owner sees when it fired, the notice counts, and still the release.
    const view = await ownerView(alice, envelope.releaseId);
    assert.equal(view.status, 'triggered');
    assert.equal(view.releasedAt, firesAt.toISOString());
    assert.deepEqual(view.notices, { total: 2, sent: 0, pending: 2, failed: 0 });
    assert.ok(view.release);
    assert.equal(view.encryptedPayload, undefined);
    assert.ok(!JSON.stringify(view).includes('!'), 'no room of any kind in the owner view');

    // The read needs deadman.read.
    const narrowed = await app.request('/v1/deadman/releases', {
        headers: headers(bob, 'deadman.write'),
    });
    assert.equal(narrowed.status, 403);

    // The owner's event feed records the arm and the trigger with no room: the
    // field is there and null, as the protocol's envelopes have it.
    const feed = await app.request('/v1/deadman/events', { headers: headers(alice) });
    assert.equal(feed.status, 200);
    const events = (
        (await feed.json()) as Array<{ type: string; payload: Record<string, unknown> }>
    ).filter((e) => e.payload.switchId === envelope.releaseId);
    assert.deepEqual(
        events.map((e) => e.type),
        ['deadman.switch.armed', 'deadman.switch.triggered']
    );
    for (const event of events) {
        assert.ok('roomId' in event.payload, `${event.type} carries a roomId field`);
        assert.equal(event.payload.roomId, null);
    }
});

test('re-sealing replaces one recipient’s copy after their key changed, and refuses everything else', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const bystander = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    const oldCopy = envelope.copies.find((c) => c.recipientAccountId === recipient.user.id)!;

    // The recipient replaces their keys; the owner's device re-seals from its own copy.
    const recipientNow = await protocol.createReleaseKeySet(recipient.user.id);
    publish(recipientNow);
    const view = await ownerView(owner.user, envelope.releaseId);
    const resealInput = {
        header: view.release!.header,
        ownCopy: view.release!.ownCopy,
        ownerKeySet: owner.keySet,
        recipient: recipientNow.identity,
        releaseId: envelope.releaseId,
    };
    const newCopy = await protocol.resealReleaseCopy(resealInput);

    // Refusals first, so the old copy is what they leave in place.
    await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: oldCopy }),
        409,
        'recipient_identity_superseded'
    );
    await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: newCopy, extra: 1 }),
        400,
        'invalid_request'
    );
    await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: { ...newCopy, sealedKey: 'AA==' } }),
        400,
        'invalid_release_envelope'
    );
    await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: tamperSignature(newCopy) }),
        400,
        'invalid_release_signature'
    );
    const forBystander = await protocol.resealReleaseCopy({
        ...resealInput,
        recipient: bystander.keySet.identity,
    });
    const notNamed = await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: forBystander }),
        400,
        'not_a_recipient'
    );
    assert.equal(notNamed.recipientAccountId, bystander.user.id);
    const unpublished = await protocol.createReleaseKeySet(recipient.user.id);
    const toUnpublished = await protocol.resealReleaseCopy({
        ...resealInput,
        recipient: unpublished.identity,
    });
    await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: toUnpublished }),
        400,
        'recipient_identity_unknown'
    );
    // Someone else's switch and an unknown id: the one answer.
    assert.equal((await reseal(recipient.user, envelope.releaseId, { copy: newCopy })).status, 404);
    assert.equal((await reseal(owner.user, randomUUID(), { copy: newCopy })).status, 404);
    // A legacy switch holds no release.
    const legacy = seedLegacy(owner.user);
    await errorOf(await reseal(owner.user, legacy.id, { copy: newCopy }), 409, 'not_a_release');
    assert.deepEqual(
        db.getDeadmanReleaseWrap(envelope.releaseId, recipient.user.id)?.sealedKey,
        oldCopy.sealedKey
    );

    // The re-seal, with the flag off too: the flag gates arming only.
    delete process.env.BLACKOUT_DEADMAN_RELEASES;
    let resealed: Response;
    try {
        resealed = await reseal(owner.user, envelope.releaseId, { copy: newCopy });
    } finally {
        process.env.BLACKOUT_DEADMAN_RELEASES = '1';
    }
    assert.equal(resealed.status, 200);
    const after = (await resealed.json()) as DeadmanSwitchPayload;
    assert.deepEqual(after.release?.sealedTo, [
        { recipientAccountId: recipient.user.id, recipientFingerprint: recipientNow.fingerprint },
    ]);
    assert.deepEqual(
        after.release?.ownCopy,
        view.release!.ownCopy,
        'the owner’s copy is unchanged'
    );
    assert.equal(after.encryptedPayload, undefined);
    const wrap = db.getDeadmanReleaseWrap(envelope.releaseId, recipient.user.id)!;
    assert.equal(wrap.sealedKey, newCopy.sealedKey);
    assert.equal(wrap.signature, newCopy.signature);
    assert.equal(wrap.recipientFingerprint, recipientNow.fingerprint);
    assert.equal(db.listDeadmanReleaseWraps(envelope.releaseId).length, 2);

    // After the trigger the recipient gets the new copy and opens it with the new keys.
    sweepAt(FIRES_AT());
    const [release] = await releasesFor(recipient.user);
    assert.deepEqual(release.copy, newCopy);
    const opened = await protocol.openReleaseCopy({
        header: release.header,
        copy: release.copy,
        ownerIdentity: release.ownerIdentity,
        recipientAccountId: recipient.user.id,
        keySets: [recipientNow],
    });
    assert.equal(opened.ok && opened.text, MESSAGE);

    // Nothing is re-sealed after the trigger, nor on a cancelled switch, nor
    // under an owner identity that is no longer current.
    await errorOf(
        await reseal(owner.user, envelope.releaseId, { copy: newCopy }),
        409,
        'switch_triggered'
    );
    const second = await build(owner.keySet, [recipientNow.identity]);
    assert.equal((await arm(owner.user, armBody(second))).status, 201);
    const secondCopy = await protocol.resealReleaseCopy({
        header: (await ownerView(owner.user, second.releaseId)).release!.header,
        ownCopy: (await ownerView(owner.user, second.releaseId)).release!.ownCopy,
        ownerKeySet: owner.keySet,
        recipient: recipientNow.identity,
        releaseId: second.releaseId,
    });
    publish(await protocol.createReleaseKeySet(owner.user.id));
    await errorOf(
        await reseal(owner.user, second.releaseId, { copy: secondCopy }),
        409,
        'owner_identity_changed'
    );
    await app.request(`/v1/deadman/switches/${second.releaseId}/cancel`, {
        method: 'POST',
        headers: headers(owner.user),
    });
    await errorOf(
        await reseal(owner.user, second.releaseId, { copy: secondCopy }),
        409,
        'switch_cancelled'
    );
});

test('cancel removes the content and every copy; a second cancel removes what a cancelled switch still holds; nothing is ever released', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);

    const cancel = await app.request(`/v1/deadman/switches/${envelope.releaseId}/cancel`, {
        method: 'POST',
        headers: headers(owner.user),
    });
    assert.equal(cancel.status, 200);
    const body = (await cancel.json()) as Envelope;
    assert.equal(body.event, 'blackout.deadman.switch.cancelled');
    assert.equal(body.payload.status, 'cancelled');
    assert.equal(body.payload.release, undefined, 'a cancelled switch holds no release');
    assert.equal(body.payload.encryptedPayload, undefined);
    assert.equal(body.payload.releaseFormat, 'release-v1');
    assert.equal(body.payload.headline, 'the blue folder', 'the label is the owner’s and stays');
    assert.equal(db.getDeadmanSwitch(envelope.releaseId)?.encryptedPayload, '');
    for (const wrap of db.listDeadmanReleaseWraps(envelope.releaseId)) {
        assert.equal(wrap.sealedKey, '');
        assert.equal(wrap.signature, '');
    }
    assert.equal(db.listDeadmanReleaseWraps(envelope.releaseId).length, 2, 'the rows stay');

    // A switch cancelled before cancel removed copies (the row as a database
    // from before this code would hold it): a second cancel removes them.
    const earlier = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(earlier))).status, 201);
    db.updateDeadmanSwitch(earlier.releaseId, { status: 'cancelled' });
    const again = await app.request(`/v1/deadman/switches/${earlier.releaseId}/cancel`, {
        method: 'POST',
        headers: headers(owner.user),
    });
    assert.equal(again.status, 200);
    assert.equal(db.getDeadmanSwitch(earlier.releaseId)?.encryptedPayload, '');
    assert.ok(db.listDeadmanReleaseWraps(earlier.releaseId).every((w) => w.sealedKey === ''));

    // However long after, the sweep fires neither, and the recipient gets nothing.
    sweepAt(new Date(Date.now() + 400 * 24 * 3600 * 1000));
    assert.equal(db.getDeadmanSwitch(envelope.releaseId)?.status, 'cancelled');
    assert.deepEqual(await releasesFor(recipient.user), []);
});

test('365 days after it fired, a release’s content and copies are removed; the rows and the notice counts stay', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    const firesAt = FIRES_AT();
    sweepAt(firesAt);
    assert.equal((await releasesFor(recipient.user)).length, 1);

    const justBefore = new Date(firesAt.getTime() + DEADMAN_RELEASE_RETENTION_MS - 1000);
    sweepAt(justBefore);
    assert.equal((await releasesFor(recipient.user)).length, 1, 'held until the day');
    assert.notEqual(db.getDeadmanSwitch(envelope.releaseId)?.encryptedPayload, '');

    const onTheDay = new Date(firesAt.getTime() + DEADMAN_RELEASE_RETENTION_MS);
    sweepAt(onTheDay);
    const record = db.getDeadmanSwitch(envelope.releaseId)!;
    assert.equal(record.status, 'triggered');
    assert.equal(record.releasedAt, firesAt.toISOString());
    assert.equal(record.encryptedPayload, '', 'the content and the owner’s identity copy are gone');
    const wraps = db.listDeadmanReleaseWraps(envelope.releaseId);
    assert.equal(wraps.length, 2);
    assert.ok(wraps.every((w) => w.sealedKey === '' && w.signature === ''));
    assert.deepEqual(await releasesFor(recipient.user), []);
    const view = await ownerView(owner.user, envelope.releaseId);
    assert.equal(view.release, undefined);
    assert.equal(view.releasedAt, firesAt.toISOString());
    assert.deepEqual(view.notices, { total: 1, sent: 0, pending: 1, failed: 0 });
    assert.equal(
        db.listDeadmanReleaseNotices(envelope.releaseId).length,
        1,
        'the notice rows stay'
    );
    // Idempotent.
    sweepAt(new Date(onTheDay.getTime() + 1000));
    assert.equal(db.getDeadmanSwitch(envelope.releaseId)?.encryptedPayload, '');
});

test('legacy switches behave as before: status only on trigger, the payload to recipients by account id, no release, no notices', async () => {
    const owner = seedUser();
    const recipient = seedUser();
    const legacy = seedLegacy(owner, { recipients: [recipient.id] });
    const view = await ownerView(owner, legacy.id);
    assert.equal(view.releaseFormat, 'legacy');
    assert.equal(view.roomId, '!room:example.org');
    assert.equal(view.encryptedPayload, 'sealed-legacy-payload');
    assert.equal(view.release, undefined);

    sweepAt(FIRES_AT());
    const fired = db.getDeadmanSwitch(legacy.id)!;
    assert.equal(fired.status, 'triggered');
    assert.equal(fired.releasedAt, undefined, 'a legacy switch records no release');
    assert.equal(db.listDeadmanReleaseNotices(legacy.id).length, 0, 'and sends no notice');
    assert.equal(db.listDeadmanReleaseWraps(legacy.id).length, 0);
    const read = await app.request(`/v1/deadman/switches/${legacy.id}`, {
        headers: headers(recipient),
    });
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), {
        switchId: legacy.id,
        ownerId: owner.id,
        status: 'triggered',
        releaseAt: legacy.releaseAt,
        encryptedPayload: 'sealed-legacy-payload',
    });
    const list = await app.request('/v1/deadman/switches?scope=recipient', {
        headers: headers(recipient),
    });
    assert.ok(JSON.stringify(await list.json()).includes(legacy.id));
    assert.deepEqual(await releasesFor(recipient), [], 'a legacy switch is not a release');
    const after = await ownerView(owner, legacy.id);
    assert.equal(after.notices, undefined);
    assert.equal(after.releasedAt, undefined);
    // Removal leaves legacy switches alone, however old.
    sweepAt(new Date(Date.now() + 2 * DEADMAN_RELEASE_RETENTION_MS));
    assert.equal(db.getDeadmanSwitch(legacy.id)?.encryptedPayload, 'sealed-legacy-payload');
});

test('GET /limits says what the arming form may say, from the deployment’s own numbers', async () => {
    const res = await app.request('/v1/deadman/limits', { headers: headers(alice) });
    assert.equal(res.status, 200);
    const limits = (await res.json()) as DeadmanLimits;
    assert.deepEqual(limits, {
        armingAvailable: true,
        checkInIntervalSeconds: { min: 60, max: 60 * 60 * 24 * 365 },
        gracePeriodSeconds: { min: 0, max: 60 * 60 * 24 * 30 },
        maxRecipients: 64,
        maxMessageBytes: 65536,
        paddedSizes: [1024, 16384, 262144],
        labelMaxLength: 280,
        maxHeldReleaseSwitches: 20,
        maxArmsPerDay: 10,
        maxHeldReleasesPerRecipientFromOwner: 5,
        maxHeldReleasesPerRecipient: 50,
        backlogToleranceSeconds: 15 * 60,
        backlogGraceSeconds: 72 * 60 * 60,
        releaseRetentionDays: 365,
        noticeRetryDays: 30,
    });
    // The tolerance follows the sweep's configured cadence (ten intervals, 15 minutes at least).
    process.env.BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS = '600';
    try {
        const slower = await app.request('/v1/deadman/limits', { headers: headers(alice) });
        assert.equal(((await slower.json()) as DeadmanLimits).backlogToleranceSeconds, 6000);
    } finally {
        delete process.env.BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS;
    }
    const narrowed = await app.request('/v1/deadman/limits', {
        headers: headers(alice, 'deadman.write'),
    });
    assert.equal(narrowed.status, 403);
    const anonymous = await app.request('/v1/deadman/limits');
    assert.equal(anonymous.status, 401);
});

test('the export lists an owner’s release switches without any copy, and a recipient’s releases only once fired', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    const recipientCopy = envelope.copies.find((c) => c.recipientAccountId === recipient.user.id)!;

    const before = lifecycle.exportUserData(recipient.user.id)!;
    assert.deepEqual(before.deadmanReleases, [], 'nothing before the trigger');
    assert.ok(!JSON.stringify(before).includes(envelope.releaseId));

    sweepAt(FIRES_AT());
    const owners = lifecycle.exportUserData(owner.user.id)!;
    const entry = owners.deadmanSwitches.find((s) => s.id === envelope.releaseId)!;
    assert.equal(entry.releaseFormat, 'release-v1');
    assert.equal(entry.roomId, undefined);
    assert.equal(entry.recipientCount, 1);
    assert.equal(entry.releasedAt, db.getDeadmanSwitch(envelope.releaseId)?.releasedAt);
    assert.deepEqual(entry.notices, { total: 1, sent: 0, pending: 1, failed: 0 });
    const ownersText = JSON.stringify(owners.deadmanSwitches);
    assert.ok(!ownersText.includes(recipient.user.id), 'recipients are counted, not listed');
    assert.ok(!ownersText.includes(recipientCopy.sealedKey));
    assert.deepEqual(owners.deadmanReleases, []);

    const theirs = lifecycle.exportUserData(recipient.user.id)!;
    assert.equal(theirs.deadmanReleases.length, 1);
    assert.deepEqual(theirs.deadmanReleases, await releasesFor(recipient.user));
    // The notice rows about the recipient are theirs too: the room, status,
    // attempts, when it was sent or given up.
    db.updateDeadmanReleaseNotice(envelope.releaseId, recipient.user.id, {
        roomId: '!notices:test.local',
    });
    const notice = db.getDeadmanReleaseNotice(envelope.releaseId, recipient.user.id)!;
    assert.deepEqual(lifecycle.exportUserData(recipient.user.id)!.deadmanNotices, [
        {
            switchId: envelope.releaseId,
            roomId: '!notices:test.local',
            status: 'pending',
            attempts: 0,
            nextAttemptAt: notice.nextAttemptAt,
            createdAt: notice.createdAt,
        },
    ]);
    assert.deepEqual(owners.deadmanNotices, [], 'the owner has no notice rows');
    // A row for a switch that has not fired (a store from a crash) is not
    // exported: before the trigger a recipient learns nothing of a switch.
    const unfired = await build(owner.keySet, [recipient.keySet.identity], 'unfired');
    assert.equal((await arm(owner.user, armBody(unfired))).status, 201);
    db.createDeadmanReleaseNotice({
        switchId: unfired.releaseId,
        recipientAccountId: recipient.user.id,
        nextAttemptAt: new Date().toISOString(),
    });
    const afterCrashRow = lifecycle.exportUserData(recipient.user.id)!;
    assert.equal(afterCrashRow.deadmanNotices.length, 1);
    assert.ok(!JSON.stringify(afterCrashRow).includes(unfired.releaseId));
    // Through the route too.
    const res = await app.request('/v1/auth/account/export', { headers: headers(recipient.user) });
    assert.equal(res.status, 200);
    const exported = (await res.json()) as {
        deadmanReleases: DeadmanReleasedCopy[];
        deadmanNotices: Array<{ switchId: string }>;
    };
    assert.deepEqual(exported.deadmanReleases[0].copy, recipientCopy);
    assert.deepEqual(
        exported.deadmanNotices.map((n) => n.switchId),
        [envelope.releaseId]
    );
});

test('deleting an owner’s account removes an unfired release’s copies and keeps a fired one for the people it named; deleting a recipient’s removes their copies and ends their notices', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const other = await freshPerson();
    const armed = await build(owner.keySet, [recipient.keySet.identity]);
    const fired = await build(owner.keySet, [recipient.keySet.identity, other.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(armed))).status, 201);
    assert.equal((await arm(owner.user, armBody(fired))).status, 201);
    db.updateDeadmanSwitch(fired.releaseId, {
        lastCheckInAt: new Date(Date.now() - 3600_000).toISOString(),
        triggerAt: new Date(Date.now() - 600_000).toISOString(),
        releaseAt: new Date(Date.now() - 600_000).toISOString(),
    });
    sweepAt(new Date());
    assert.equal(db.getDeadmanSwitch(fired.releaseId)?.status, 'triggered');
    assert.equal(db.getDeadmanSwitch(armed.releaseId)?.status, 'armed');
    const firedContent = db.getDeadmanSwitch(fired.releaseId)!.encryptedPayload;

    // The recipient is named on someone else's fired switch too, with a notice pending in a room.
    const theirs = await build(other.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(other.user, armBody(theirs))).status, 201);
    db.updateDeadmanSwitch(theirs.releaseId, {
        triggerAt: new Date(Date.now() - 600_000).toISOString(),
        releaseAt: new Date(Date.now() - 600_000).toISOString(),
    });
    sweepAt(new Date());
    db.updateDeadmanReleaseNotice(theirs.releaseId, recipient.user.id, {
        roomId: '!notices:test.local',
    });
    db.updateDeadmanReleaseNotice(fired.releaseId, recipient.user.id, {
        roomId: '!notices:test.local',
        status: 'sent',
        sentAt: new Date().toISOString(),
    });

    const issued = lifecycle.requestAccountDeletion({ userId: owner.user.id })!;
    assert.equal(lifecycle.confirmAccountDeletion(issued.token, owner.user.id).kind, 'ok');

    const cancelled = db.getDeadmanSwitch(armed.releaseId)!;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.encryptedPayload, '');
    assert.equal(cancelled.headline, undefined);
    assert.ok(db.listDeadmanReleaseWraps(armed.releaseId).every((w) => w.sealedKey === ''));
    assert.deepEqual(
        await releasesFor(recipient.user)
            .then((r) => r.map((x) => x.releaseId))
            .then((ids) => ids.sort()),
        [fired.releaseId, theirs.releaseId].sort()
    );

    const kept = db.getDeadmanSwitch(fired.releaseId)!;
    assert.equal(kept.status, 'triggered');
    assert.equal(
        kept.encryptedPayload,
        firedContent,
        'a fired release keeps its content and the owner’s identity'
    );
    assert.equal(kept.headline, undefined);
    assert.notEqual(db.getDeadmanReleaseWrap(fired.releaseId, recipient.user.id)?.sealedKey, '');
    assert.notEqual(db.getDeadmanReleaseWrap(fired.releaseId, other.user.id)?.sealedKey, '');
    assert.equal(
        db.getDeadmanReleaseWrap(fired.releaseId, owner.user.id)?.sealedKey,
        '',
        'the owner’s own copy goes with the owner'
    );
    const [stillReadable] = (await releasesFor(other.user)).filter(
        (r) => r.releaseId === fired.releaseId
    );
    const opened = await protocol.openReleaseCopy({
        header: stillReadable.header,
        copy: stillReadable.copy,
        ownerIdentity: stillReadable.ownerIdentity,
        recipientAccountId: other.user.id,
        keySets: [other.keySet],
    });
    assert.equal(
        opened.ok && opened.text,
        MESSAGE,
        'the owner’s identity kept with the release still checks it'
    );

    // Now the recipient deletes their account.
    const issued2 = lifecycle.requestAccountDeletion({ userId: recipient.user.id })!;
    assert.equal(lifecycle.confirmAccountDeletion(issued2.token, recipient.user.id).kind, 'ok');
    for (const id of [fired.releaseId, theirs.releaseId]) {
        assert.equal(
            db.getDeadmanReleaseWrap(id, recipient.user.id)?.sealedKey,
            '',
            `${id}: their copy is gone`
        );
    }
    assert.notEqual(
        db.getDeadmanReleaseWrap(fired.releaseId, other.user.id)?.sealedKey,
        '',
        'nobody else’s copy is touched'
    );
    const ended = db.getDeadmanReleaseNotice(theirs.releaseId, recipient.user.id)!;
    assert.equal(ended.status, 'failed');
    assert.equal(ended.lastError, 'recipient_gone');
    assert.ok(ended.failedAt);
    assert.equal(ended.roomId, undefined);
    const sent = db.getDeadmanReleaseNotice(fired.releaseId, recipient.user.id)!;
    assert.equal(sent.status, 'sent', 'a sent notice stays sent');
    assert.equal(sent.roomId, undefined, 'but forgets its room');
    assert.equal(db.findDeadmanNoticeRoom(recipient.user.id), undefined);
    assert.equal(
        db.getDeadmanSwitch(theirs.releaseId)?.recipients.includes(recipient.user.id),
        true
    );
    const ownersView = await ownerView(other.user, theirs.releaseId);
    assert.deepEqual(ownersView.release?.sealedTo, [], 'the owner sees no copy held for them');
    assert.deepEqual(ownersView.notices, { total: 1, sent: 0, pending: 0, failed: 1 });
});

test('a re-seal that races a cancel writes nothing: the switch is read again after the signature check', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    const recipientNow = await protocol.createReleaseKeySet(recipient.user.id);
    publish(recipientNow);
    const view = await ownerView(owner.user, envelope.releaseId);
    const newCopy = await protocol.resealReleaseCopy({
        header: view.release!.header,
        ownCopy: view.release!.ownCopy,
        ownerKeySet: owner.keySet,
        recipient: recipientNow.identity,
        releaseId: envelope.releaseId,
    });

    // The cancel lands while the route verifies the signature, which is the
    // first WebCrypto verify the request makes after it read the switch.
    const subtle = globalThis.crypto.subtle;
    const realVerify = subtle.verify.bind(subtle);
    let cancelledDuringVerify = false;
    subtle.verify = (async (...args: Parameters<SubtleCrypto['verify']>) => {
        if (!cancelledDuringVerify) {
            cancelledDuringVerify = true;
            db.updateDeadmanSwitch(envelope.releaseId, {
                status: 'cancelled',
                encryptedPayload: '',
            });
            blankReleaseWraps(envelope.releaseId);
        }
        return realVerify(...args);
    }) as SubtleCrypto['verify'];
    try {
        await errorOf(
            await reseal(owner.user, envelope.releaseId, { copy: newCopy }),
            409,
            'switch_cancelled'
        );
    } finally {
        subtle.verify = realVerify;
    }
    assert.ok(cancelledDuringVerify);
    assert.equal(
        db.getDeadmanReleaseWrap(envelope.releaseId, recipient.user.id)?.sealedKey,
        '',
        'no copy was written on a cancelled switch'
    );

    // The re-seal body is capped: a copy far over its size is refused before it is read.
    const bloated = { copy: { ...newCopy, sealedKey: 'A'.repeat(RELEASE_RESEAL_MAX_BODY_BYTES) } };
    await errorOf(await reseal(owner.user, envelope.releaseId, bloated), 413, 'payload_too_large');
});

test('a release whose content is gone while a copy is still held is not served, and the removal counts each release once', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    const firesAt = FIRES_AT();
    sweepAt(firesAt);
    assert.equal((await releasesFor(recipient.user)).length, 1);
    // Half a removal (a crash between blanking the content and the copies).
    db.updateDeadmanSwitch(envelope.releaseId, { encryptedPayload: '' });
    assert.notEqual(db.getDeadmanReleaseWrap(envelope.releaseId, recipient.user.id)?.sealedKey, '');
    assert.deepEqual(
        await releasesFor(recipient.user),
        [],
        'nothing to open, so nothing is served'
    );
    const view = await ownerView(owner.user, envelope.releaseId);
    assert.equal(view.release, undefined);
    assert.equal(view.status, 'triggered');

    // The other half: the copies blanked (the removal does them first) while
    // the content is still there. A blank copy is not served as a copy.
    const other = await build(owner.keySet, [recipient.keySet.identity], 'second message');
    assert.equal((await arm(owner.user, armBody(other))).status, 201);
    sweepAt(firesAt);
    assert.ok((await releasesFor(recipient.user)).some((r) => r.releaseId === other.releaseId));
    blankReleaseWraps(other.releaseId);
    assert.notEqual(db.getDeadmanSwitch(other.releaseId)?.encryptedPayload, '');
    const served = await releasesFor(recipient.user);
    assert.ok(
        !served.some((r) => r.releaseId === other.releaseId),
        'a blank copy is served to nobody'
    );
    assert.ok(!JSON.stringify(served).includes('"sealedKey":""'));

    // A stored release whose owner identity does not have an identity's shape
    // (only a corrupted store writes one) is served to nobody rather than as
    // an identity with missing fields.
    const third = await build(owner.keySet, [recipient.keySet.identity], 'third message');
    assert.equal((await arm(owner.user, armBody(third))).status, 201);
    sweepAt(firesAt);
    const { header: thirdHeader } = JSON.parse(
        db.getDeadmanSwitch(third.releaseId)!.encryptedPayload
    ) as { header: unknown };
    db.updateDeadmanSwitch(third.releaseId, {
        encryptedPayload: JSON.stringify({ header: thirdHeader, ownerIdentity: { bogus: true } }),
    });
    assert.ok(!(await releasesFor(recipient.user)).some((r) => r.releaseId === third.releaseId));
    assert.equal((await ownerView(owner.user, third.releaseId)).release, undefined);

    // The removal finishes the job once, and then has nothing to do.
    const onTheDay = new Date(firesAt.getTime() + DEADMAN_RELEASE_RETENTION_MS);
    // Other tests' releases expire at this moment too; this one is among them.
    assert.ok(removeExpiredReleases(onTheDay) >= 1);
    assert.equal(db.getDeadmanReleaseWrap(envelope.releaseId, recipient.user.id)?.sealedKey, '');
    assert.equal(removeExpiredReleases(onTheDay), 0, 'a second pass changes nothing');
    assert.equal(removeExpiredReleases(new Date(onTheDay.getTime() + 86_400_000)), 0);
});

test('a legacy switch holds no release whatever its payload looks like, and a fired release outlives its owner without an owner view', async () => {
    const owner = await freshPerson();
    const recipient = await freshPerson();
    const envelope = await build(owner.keySet, [recipient.keySet.identity]);
    const { copies: _copies, ...header } = envelope;
    // A legacy payload that happens to be a stored release's JSON.
    const legacy = seedLegacy(owner.user, {
        encryptedPayload: JSON.stringify({ header, ownerIdentity: owner.keySet.identity }),
    });
    const copy = envelope.copies.find((c) => c.recipientAccountId === recipient.user.id)!;
    await errorOf(await reseal(owner.user, legacy.id, { copy }), 409, 'not_a_release');
    const legacyView = await ownerView(owner.user, legacy.id);
    assert.equal(legacyView.release, undefined);
    assert.equal(legacyView.releaseFormat, 'legacy');
    assert.equal(
        typeof legacyView.encryptedPayload,
        'string',
        'a legacy payload is given back as it was sent'
    );

    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    sweepAt(FIRES_AT());
    const issued = lifecycle.requestAccountDeletion({ userId: owner.user.id })!;
    assert.equal(lifecycle.confirmAccountDeletion(issued.token, owner.user.id).kind, 'ok');
    // Nobody can sign in as the owner any more; the view a session would get
    // holds the counts and no release, since the owner's own copy is gone.
    const orphaned = recordToOwnerView(db.getDeadmanSwitch(envelope.releaseId)!);
    assert.equal(orphaned.release, undefined);
    assert.deepEqual(orphaned.notices, { total: 1, sent: 0, pending: 1, failed: 0 });
    assert.equal(orphaned.encryptedPayload, undefined);
    assert.equal((await releasesFor(recipient.user)).length, 1, 'the recipient still reads it');
});

test('the 365-day removal lists each release’s copies by switch: a pass over releases already removed does not scan the copies', () => {
    // Fired long ago, removed on the first pass; every later pass must cost
    // one indexed lookup per release, not a scan of every copy row (the
    // independent review's P3b-M4: 8 s a tick at 10,000 removed releases).
    const owner = randomUUID();
    const releasedAt = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
    const ids: string[] = [];
    for (let i = 0; i < 1500; i += 1) {
        const id = randomUUID();
        ids.push(id);
        for (const account of [owner, randomUUID(), randomUUID()]) {
            db.putDeadmanReleaseWrap({
                switchId: id,
                recipientAccountId: account,
                recipientFingerprint: 'ab'.repeat(32),
                sealedKey: 'sealed',
                signature: 'signed',
            });
        }
        db.createDeadmanSwitch({
            id,
            ownerId: owner,
            status: 'triggered',
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            lastCheckInAt: releasedAt,
            triggerAt: releasedAt,
            releaseAt: releasedAt,
            recipients: [],
            encryptedPayload: '{"header":{},"ownerIdentity":{}}',
            releaseFormat: 'release-v1',
            releasedAt,
        });
    }
    assert.equal(db.listDeadmanReleaseWraps(ids[7]).length, 3, 'listed by switch');
    assert.ok(removeExpiredReleases(new Date()) >= 1500);
    assert.ok(db.listDeadmanReleaseWraps(ids[7]).every((w) => w.sealedKey === ''));

    // The second pass: nothing to do, and no walk over the copies map; nor
    // over the notices map when one release's notices are counted.
    db.createDeadmanReleaseNotice({
        switchId: ids[7],
        recipientAccountId: randomUUID(),
        nextAttemptAt: releasedAt,
    });
    const iterators = ['values', 'entries', 'keys', 'forEach', Symbol.iterator] as const;
    const maps = [db.deadmanReleaseWraps, db.deadmanReleaseNotices].map(
        (map) => map as unknown as Record<string | symbol, unknown>
    );
    const saved = maps.flatMap((map) => iterators.map((name) => [map, name, map[name]] as const));
    let walks = 0;
    for (const [map, name, original] of saved) {
        map[name] = function walk(this: unknown, ...args: unknown[]) {
            walks += 1;
            return (original as (...a: unknown[]) => unknown).apply(this, args);
        };
    }
    let removed: number;
    let elapsedMs: number;
    let counts: ReturnType<typeof noticeCounts>;
    try {
        const started = performance.now();
        removed = removeExpiredReleases(new Date());
        elapsedMs = performance.now() - started;
        counts = noticeCounts(ids[7]);
    } finally {
        for (const [map, name] of saved) delete map[name];
    }
    assert.equal(removed, 0);
    assert.deepEqual(counts, { total: 1, sent: 0, pending: 1, failed: 0 });
    assert.equal(walks, 0, 'neither the copies map nor the notices map was iterated');
    assert.ok(elapsedMs < 2000, `a no-op pass over 1,500 removed releases took ${elapsedMs} ms`);
    assert.equal(db.listDeadmanReleaseWraps(ids[1499]).length, 3, 'the index is intact');
});

test('a person’s copies and notices are listed through the index, not a scan: the per-recipient bounds and the room lookup cost that person’s rows', () => {
    // The per-recipient bounds are read once per copy on every arm, the
    // release read and account deletion list a person's copies, and the
    // notifier looks a person's room up; a scan of every copy row for each
    // (round 2 of the independent review of part 2) grew with everyone's
    // switches. Here 1,500 other people's switches, and seven that name one
    // person: three with content held, two cancelled, two the person owns.
    const victim = randomUUID();
    const releasedAt = new Date(Date.now() - 1000).toISOString();
    const seed = (
        ownerId: string,
        recipient: string,
        content: string,
        status: 'armed' | 'triggered' | 'cancelled'
    ) => {
        const id = randomUUID();
        for (const account of [ownerId, recipient]) {
            db.putDeadmanReleaseWrap({
                switchId: id,
                recipientAccountId: account,
                recipientFingerprint: 'ab'.repeat(32),
                sealedKey: content === '' ? '' : 'sealed',
                signature: content === '' ? '' : 'signed',
            });
        }
        db.createDeadmanSwitch({
            id,
            ownerId,
            status,
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            lastCheckInAt: releasedAt,
            triggerAt: releasedAt,
            releaseAt: releasedAt,
            recipients: [recipient],
            encryptedPayload: content,
            releaseFormat: 'release-v1',
            ...(status === 'triggered' ? { releasedAt } : {}),
        });
        return id;
    };
    const held = '{"header":{},"ownerIdentity":{}}';
    for (let i = 0; i < 1500; i += 1) seed(randomUUID(), randomUUID(), held, 'triggered');
    const namers = [randomUUID(), randomUUID(), randomUUID()];
    const naming = [
        seed(namers[0], victim, held, 'armed'),
        seed(namers[0], victim, held, 'triggered'),
        seed(namers[1], victim, held, 'armed'),
        seed(namers[2], victim, '', 'cancelled'),
        seed(namers[2], victim, '', 'cancelled'),
        seed(victim, randomUUID(), held, 'armed'),
        seed(victim, randomUUID(), held, 'armed'),
    ];
    for (const [index, switchId] of [naming[1], naming[0]].entries()) {
        db.createDeadmanReleaseNotice({
            switchId,
            recipientAccountId: victim,
            nextAttemptAt: releasedAt,
        });
        const row = db.updateDeadmanReleaseNotice(switchId, victim, {
            roomId: `!room-${index}:test.local`,
        })!;
        // The second is the newer by a clear second, not by the same millisecond.
        db.deadmanReleaseNotices.set(`${switchId}:${victim}`, {
            ...row,
            updatedAt: new Date(Date.parse(releasedAt) + (index + 1) * 1000).toISOString(),
        });
    }

    const iterators = ['values', 'entries', 'keys', 'forEach', Symbol.iterator] as const;
    const maps = [db.deadmanReleaseWraps, db.deadmanReleaseNotices].map(
        (map) => map as unknown as Record<string | symbol, unknown>
    );
    const saved = maps.flatMap((map) => iterators.map((name) => [map, name, map[name]] as const));
    let walks = 0;
    for (const [map, name, original] of saved) {
        map[name] = function walk(this: unknown, ...args: unknown[]) {
            walks += 1;
            return (original as (...a: unknown[]) => unknown).apply(this, args);
        };
    }
    let counts: ReturnType<typeof heldReleasesNaming>;
    let copies: number;
    let notices: number;
    let room: string | undefined;
    let elapsedMs: number;
    try {
        const started = performance.now();
        counts = heldReleasesNaming(victim);
        copies = db.listDeadmanReleaseWrapsForRecipient(victim).length;
        notices = db.listDeadmanReleaseNoticesForRecipient(victim).length;
        room = db.findDeadmanNoticeRoom(victim);
        elapsedMs = performance.now() - started;
    } finally {
        for (const [map, name] of saved) delete map[name];
    }
    assert.equal(counts.total, 3, 'held, not owned, cancelled ones not counted');
    assert.deepEqual(
        [...counts.fromOwner.entries()].sort(),
        [
            [namers[0], 2],
            [namers[1], 1],
        ].sort()
    );
    assert.equal(copies, 7, 'every copy sealed to the person, blanked ones included');
    assert.equal(notices, 2);
    assert.equal(room, '!room-1:test.local', 'the newest notice’s room');
    assert.equal(walks, 0, 'neither the copies map nor the notices map was iterated');
    assert.ok(
        elapsedMs < 200,
        `listing one person’s rows among 1,500 switches took ${elapsedMs} ms`
    );
});

test('a recipient whose account was deleted before the trigger gets no notice row; the others do', async () => {
    const owner = await freshPerson();
    const leaving = await freshPerson();
    const staying = await freshPerson();
    const envelope = await build(owner.keySet, [leaving.keySet.identity, staying.keySet.identity]);
    assert.equal((await arm(owner.user, armBody(envelope))).status, 201);
    const issued = lifecycle.requestAccountDeletion({ userId: leaving.user.id })!;
    assert.equal(lifecycle.confirmAccountDeletion(issued.token, leaving.user.id).kind, 'ok');
    assert.equal(db.getDeadmanReleaseWrap(envelope.releaseId, leaving.user.id)?.sealedKey, '');

    sweepAt(FIRES_AT());
    const notices = db.listDeadmanReleaseNotices(envelope.releaseId);
    assert.deepEqual(
        notices.map((n) => n.recipientAccountId),
        [staying.user.id],
        'no notice is owed to an account that is gone'
    );
    assert.deepEqual((await ownerView(owner.user, envelope.releaseId)).notices, {
        total: 1,
        sent: 0,
        pending: 1,
        failed: 0,
    });
});
