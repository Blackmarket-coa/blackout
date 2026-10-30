/**
 * `is_direct` on the bot's invites (the dead-man release notices room,
 * `docs/security/deadman-release-design-2026-10-24.md` §5): `createRoom`
 * sends the invite list and `is_direct` only when asked, and `inviteToRoom`
 * with `isDirect` sets the membership through the state endpoint, since
 * `/invite` takes no `is_direct`. What Synapse does with each is read in the
 * fork, not run here (`handlers/room.py` copies `is_direct` onto each invite
 * event; `rest/client/room.py` hands a member state PUT's content to
 * `update_membership`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const { matrixClient } = await import('../src/integrations/matrix-client');

type Call = { url: string; method: string; body: Record<string, unknown> };
const calls: Call[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({
        url,
        method: (init?.method ?? 'GET').toUpperCase(),
        body:
            typeof init?.body === 'string'
                ? (JSON.parse(init.body) as Record<string, unknown>)
                : {},
    });
    return new Response(JSON.stringify({ room_id: '!new:test.local', event_id: '$e:test.local' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}) as typeof fetch;

test('createRoom sends the invite list and is_direct only when asked, the preset and initial_state as given, and no encryption event when encrypted is false', async () => {
    calls.length = 0;
    // The notifier's arguments: `public_chat` with an invite-only join rule is
    // what keeps the homeserver's backstop from encrypting the room.
    const direct = await matrixClient.createRoom({
        name: 'Blackout notices',
        visibility: 'private',
        preset: 'public_chat',
        encrypted: false,
        initialState: [
            { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
        ],
        invite: ['@bob:test.local'],
        isDirect: true,
        powerLevelOverride: { events_default: 50, invite: 50 },
    });
    assert.deepEqual(direct, { ok: true, status: 200, roomId: '!new:test.local' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/_matrix\/client\/v3\/createRoom$/);
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body.invite, ['@bob:test.local']);
    assert.equal(calls[0].body.is_direct, true);
    assert.equal(calls[0].body.visibility, 'private');
    assert.equal(calls[0].body.preset, 'public_chat');
    assert.equal(calls[0].body.name, 'Blackout notices');
    assert.deepEqual(calls[0].body.power_level_content_override, {
        events_default: 50,
        invite: 50,
    });
    assert.deepEqual(
        calls[0].body.initial_state,
        [{ type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } }],
        'encrypted: false adds no encryption event; the join rule is sent as given'
    );

    calls.length = 0;
    await matrixClient.createRoom({
        encrypted: false,
        visibility: 'private',
        preset: 'private_chat',
    });
    assert.equal(calls[0].body.initial_state, undefined, 'no initial_state when none is asked for');

    calls.length = 0;
    await matrixClient.createRoom({
        encrypted: true,
        visibility: 'private',
        preset: 'private_chat',
    });
    assert.equal(calls[0].body.invite, undefined);
    assert.equal(calls[0].body.is_direct, undefined);
    assert.deepEqual(calls[0].body.initial_state, [
        {
            type: 'm.room.encryption',
            state_key: '',
            content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
    ]);

    calls.length = 0;
    await matrixClient.createRoom({ encrypted: false, invite: [] });
    assert.equal(calls[0].body.invite, undefined, 'an empty invite list is not sent');
    assert.equal(calls[0].body.is_direct, undefined);
});

test('inviteToRoom with isDirect sets the membership through the state endpoint; without it, /invite as before', async () => {
    calls.length = 0;
    const direct = await matrixClient.inviteToRoom(
        '!room:test.local',
        '@bob:test.local',
        undefined,
        {
            isDirect: true,
        }
    );
    assert.deepEqual(direct, { ok: true, status: 200, detail: undefined });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PUT');
    assert.match(
        calls[0].url,
        /\/_matrix\/client\/v3\/rooms\/!room%3Atest\.local\/state\/m\.room\.member\/%40bob%3Atest\.local$/
    );
    assert.deepEqual(calls[0].body, { membership: 'invite', is_direct: true });

    calls.length = 0;
    await matrixClient.inviteToRoom('!room:test.local', '@bob:test.local', 'a reason', {
        isDirect: true,
    });
    assert.deepEqual(calls[0].body, { membership: 'invite', is_direct: true, reason: 'a reason' });

    calls.length = 0;
    await matrixClient.inviteToRoom('!room:test.local', '@bob:test.local');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/_matrix\/client\/v3\/rooms\/!room%3Atest\.local\/invite$/);
    assert.deepEqual(calls[0].body, { user_id: '@bob:test.local' });

    calls.length = 0;
    await matrixClient.inviteToRoom('!room:test.local', '@bob:test.local', 'a reason');
    assert.deepEqual(calls[0].body, { user_id: '@bob:test.local', reason: 'a reason' });
});
