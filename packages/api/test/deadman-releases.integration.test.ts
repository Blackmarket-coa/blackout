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
    RELEASE_ARM_MAX_BODY_BYTES,
    RELEASE_RESEAL_MAX_BODY_BYTES,
    recordToOwnerView,
    sweepOverdueDeadmanSwitches,
} = await import('../src/modules/deadman');
const { computeDeadlines } = await import('../src/services/deadmanScheduler');
const { DEADMAN_RELEASE_RETENTION_MS, blankReleaseWraps, removeExpiredReleases } = await import(
    '../src/services/deadmanReleases'
);
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

test('with the flag off, arming is refused with 409 before the body is read and nothing is written; reads still answer', async () => {
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
        assert.equal(((await limits.json()) as DeadmanLimits).armingAvailable, false);
        assert.deepEqual(await releasesFor(bob), []);
    } finally {
        process.env.BLACKOUT_DEADMAN_RELEASES = '1';
    }
    // Any spelling of on but 1 or true is off.
    process.env.BLACKOUT_DEADMAN_RELEASES = 'yes';
    try {
        assert.equal((await arm(alice, armBody(envelope))).status, 409);
    } finally {
        process.env.BLACKOUT_DEADMAN_RELEASES = '1';
    }
});

test('with the flag on, an owner arms a release switch: the row, one copy per account, and an owner view that holds only the owner’s copy', async () => {
    const envelope = await build(vectorKeySet(ALICE), [BOB.identity]);
    const res = await arm(alice, armBody(envelope));
    assert.equal(res.status, 201);
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

    // Over the route's body cap: refused before the body is read.
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

test('at most 20 live release switches per owner; cancelled ones do not count', async () => {
    const owner = await freshPerson();
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
        const envelope = await build(owner.keySet, [BOB.identity], `message ${i}`);
        assert.equal((await arm(owner.user, armBody(envelope))).status, 201, `arm ${i}`);
        ids.push(envelope.releaseId);
    }
    const oneMore = await build(owner.keySet, [BOB.identity]);
    await errorOf(await arm(owner.user, armBody(oneMore)), 409, 'release_switch_limit');
    assert.equal(db.getDeadmanSwitch(oneMore.releaseId), undefined);

    const cancel = await app.request(`/v1/deadman/switches/${ids[0]}/cancel`, {
        method: 'POST',
        headers: headers(owner.user),
    });
    assert.equal(cancel.status, 200);
    assert.equal((await arm(owner.user, armBody(oneMore))).status, 201);
    // Legacy switches do not count against it.
    const legacyOwner = await freshPerson();
    for (let i = 0; i < 25; i += 1) seedLegacy(legacyOwner.user);
    const legacyEnvelope = await build(legacyOwner.keySet, [BOB.identity]);
    assert.equal((await arm(legacyOwner.user, armBody(legacyEnvelope))).status, 201);
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
        maxLiveReleaseSwitches: 20,
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
    // Through the route too.
    const res = await app.request('/v1/auth/account/export', { headers: headers(recipient.user) });
    assert.equal(res.status, 200);
    const exported = (await res.json()) as { deadmanReleases: DeadmanReleasedCopy[] };
    assert.deepEqual(exported.deadmanReleases[0].copy, recipientCopy);
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
