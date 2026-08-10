// Regression coverage for the 2026-08-10 encryption audit.
//
// Before that audit `matrixClient.createRoom` could not express `initial_state`
// at all, so every server-provisioned room was born in plaintext and the only
// available remedy was a follow-up `sendStateEvent` — which left a window where
// the room existed unencrypted, and (because the result was never checked) could
// leave it plaintext permanently. These tests pin the two properties that fix
// depends on: encryption travels in `initial_state`, and each provisioner picks
// the right answer for the kind of room it is creating.
//
// See docs/audits/2026-08-10-encryption-audit.md.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.MATRIX_HOMESERVER = 'http://synapse.test';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';

const { matrixClient, MEGOLM_ALGORITHM } = await import('../src/integrations/matrix-client');
const { defaultKitDenProvisioner } = await import('../src/services/coalitionKitManifests');
const { defaultRoomProvisioner } = await import('../src/services/pluginDens');

type EncryptionEvent = { type: string; state_key?: string; content: Record<string, unknown> };

/**
 * Capture every `/createRoom` body the module sends. State events are answered
 * generically so provisioners that stamp classification markers still complete.
 */
function captureCreateRoomBodies(): {
    bodies: Array<Record<string, unknown>>;
    restore: () => void;
} {
    const bodies: Array<Record<string, unknown>> = [];
    const realFetch = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (url.includes('/createRoom')) {
            bodies.push(JSON.parse(init?.body ?? '{}'));
            return new Response(JSON.stringify({ room_id: `!room${++n}:test` }), { status: 200 });
        }
        if (url.includes('/state/')) {
            return new Response(JSON.stringify({ event_id: `$state${++n}` }), { status: 200 });
        }
        throw new Error(`unexpected fetch in test: ${url}`);
    }) as typeof globalThis.fetch;
    return {
        bodies,
        restore: () => {
            globalThis.fetch = realFetch;
        },
    };
}

const encryptionEventIn = (body: Record<string, unknown>): EncryptionEvent | undefined =>
    ((body.initial_state as EncryptionEvent[] | undefined) ?? []).find(
        (e) => e.type === 'm.room.encryption'
    );

test('createRoom with encrypted:true puts Megolm in initial_state', async () => {
    const { bodies, restore } = captureCreateRoomBodies();
    try {
        const created = await matrixClient.createRoom({
            name: 'private thing',
            preset: 'private_chat',
            visibility: 'private',
            encrypted: true,
        });
        assert.equal(created.ok, true);
        assert.equal(bodies.length, 1);

        const encryption = encryptionEventIn(bodies[0]);
        assert.ok(encryption, 'm.room.encryption present in initial_state');
        assert.equal(encryption!.state_key, '');
        assert.equal(encryption!.content.algorithm, MEGOLM_ALGORITHM);
    } finally {
        restore();
    }
});

test('createRoom with encrypted:false sends no encryption event', async () => {
    const { bodies, restore } = captureCreateRoomBodies();
    try {
        await matrixClient.createRoom({
            name: 'public thing',
            preset: 'public_chat',
            visibility: 'public',
            encrypted: false,
        });
        assert.equal(encryptionEventIn(bodies[0]), undefined);
    } finally {
        restore();
    }
});

test('extra initialState events are preserved alongside encryption', async () => {
    const { bodies, restore } = captureCreateRoomBodies();
    try {
        await matrixClient.createRoom({
            name: 'dispute',
            preset: 'private_chat',
            visibility: 'private',
            encrypted: true,
            initialState: [
                {
                    type: 'm.room.history_visibility',
                    state_key: '',
                    content: { history_visibility: 'joined' },
                },
            ],
        });
        const state = bodies[0].initial_state as EncryptionEvent[];
        assert.equal(state.length, 2);
        // Encryption first: history visibility is meaningless if the room never
        // became encrypted in the first place.
        assert.equal(state[0].type, 'm.room.encryption');
        assert.equal(state[1].type, 'm.room.history_visibility');
    } finally {
        restore();
    }
});

test('kit dens encrypt when gated and stay readable when open', async () => {
    const { bodies, restore } = captureCreateRoomBodies();
    try {
        const gated = await defaultKitDenProvisioner({
            slug: 'private-den',
            name: 'Private den',
            denType: 'private',
        } as never);
        assert.equal(gated.ok, true);
        assert.ok(encryptionEventIn(bodies[0]), 'private kit den is encrypted');

        const open = await defaultKitDenProvisioner({
            slug: 'open-den',
            name: 'Open den',
            denType: 'public',
        } as never);
        assert.equal(open.ok, true);
        assert.equal(
            encryptionEventIn(bodies[1]),
            undefined,
            'publicly joinable kit den stays readable'
        );
    } finally {
        restore();
    }
});

test('a tier-gated kit den is encrypted even when its denType is public', async () => {
    // `minTier` makes the den invite-only regardless of denType, so it is a
    // private conversation and must be encrypted like one.
    const { bodies, restore } = captureCreateRoomBodies();
    try {
        await defaultKitDenProvisioner({
            slug: 'tiered-den',
            name: 'Tiered den',
            denType: 'public',
            minTier: 'pro',
        } as never);
        assert.ok(encryptionEventIn(bodies[0]), 'tier-gated den is encrypted');
    } finally {
        restore();
    }
});

test('plugin dens encrypt when private and stay readable when public', async () => {
    const { bodies, restore } = captureCreateRoomBodies();
    try {
        await defaultRoomProvisioner({
            name: 'Private plugin den',
            denType: 'private',
            classificationStateEventType: 'co.bmc.den_classification',
            classification: {},
        } as never);
        assert.ok(encryptionEventIn(bodies[0]), 'private plugin den is encrypted');

        await defaultRoomProvisioner({
            name: 'Public plugin den',
            denType: 'public',
            classificationStateEventType: 'co.bmc.den_classification',
            classification: {},
        } as never);
        assert.equal(encryptionEventIn(bodies[1]), undefined, 'public plugin den stays readable');
    } finally {
        restore();
    }
});
