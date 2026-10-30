/**
 * `is_direct` on the bot's invites (the dead-man release notices room,
 * `docs/security/deadman-release-design-2026-10-24.md` §5): `createRoom`
 * sends the invite list and `is_direct` only when asked, and `inviteToRoom`
 * with `isDirect` sets the membership through the state endpoint, since
 * `/invite` takes no `is_direct`. Also what the notifier's alias needs:
 * `createRoom` sends `room_alias_name` and surfaces a refusal's Matrix error
 * code, `resolveRoomAlias` can skip its process cache, and `botUserId` hands
 * a signal to whoami and caches nothing when the request was aborted. What
 * Synapse does with each is read in the fork, not run here
 * (`handlers/room.py` copies `is_direct` onto each invite event and refuses a
 * taken alias with `M_ROOM_IN_USE` before it makes a room;
 * `rest/client/room.py` hands a member state PUT's content to
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

test('createRoom sends an alias as room_alias_name and surfaces a refusal’s Matrix error code; resolveRoomAlias can skip its cache and carries a signal', async () => {
    calls.length = 0;
    const withAlias = await matrixClient.createRoom({
        encrypted: false,
        visibility: 'private',
        preset: 'public_chat',
        aliasLocalpart: 'blackout-notices-0123456789abcdef0123456789abcdef',
    });
    assert.equal(withAlias.ok, true);
    assert.equal(
        calls[0].body.room_alias_name,
        'blackout-notices-0123456789abcdef0123456789abcdef'
    );

    // A taken alias: Synapse answers 400 M_ROOM_IN_USE before making a room.
    const plainFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(
            JSON.stringify({ errcode: 'M_ROOM_IN_USE', error: 'Room alias already taken' }),
            { status: 400, headers: { 'content-type': 'application/json' } }
        )) as typeof fetch;
    try {
        const refused = await matrixClient.createRoom({
            encrypted: false,
            aliasLocalpart: 'taken',
        });
        assert.deepEqual(refused, {
            ok: false,
            status: 400,
            reason: 'create_rejected',
            errcode: 'M_ROOM_IN_USE',
            detail: '{"errcode":"M_ROOM_IN_USE","error":"Room alias already taken"}',
        });
    } finally {
        globalThis.fetch = plainFetch;
    }
    // A refusal whose body is not JSON has no code, and the text stands.
    globalThis.fetch = (async () =>
        new Response('gateway timeout', { status: 504 })) as typeof fetch;
    try {
        const refused = await matrixClient.createRoom({ encrypted: false });
        assert.deepEqual(refused, {
            ok: false,
            status: 504,
            reason: 'create_rejected',
            errcode: undefined,
            detail: 'gateway timeout',
        });
    } finally {
        globalThis.fetch = plainFetch;
    }

    // The alias directory: cached by default, asked every time with
    // `cache: false`, and the request carries the caller's signal.
    const signals: Array<AbortSignal | undefined> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), body: {} });
        signals.push(init?.signal ?? undefined);
        return new Response(JSON.stringify({ room_id: `!alias-${calls.length}:test.local` }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
    try {
        calls.length = 0;
        const fresh1 = await matrixClient.resolveRoomAlias('#moving:test.local', { cache: false });
        const fresh2 = await matrixClient.resolveRoomAlias('#moving:test.local', { cache: false });
        assert.equal(calls.length, 2, 'asked twice: nothing cached');
        assert.match(calls[0].url, /\/directory\/room\/%23moving%3Atest\.local$/);
        assert.deepEqual(
            [fresh1, fresh2].map((r) => (r.ok ? r.roomId : r.reason)),
            ['!alias-1:test.local', '!alias-2:test.local'],
            'each answer is the directory’s, not the first one again'
        );
        const controller = new AbortController();
        await matrixClient.resolveRoomAlias('#moving:test.local', {
            cache: false,
            signal: controller.signal,
        });
        assert.equal(signals[2], controller.signal, 'the signal is handed to fetch');

        calls.length = 0;
        const cached1 = await matrixClient.resolveRoomAlias('#stable:test.local');
        const cached2 = await matrixClient.resolveRoomAlias('#stable:test.local');
        assert.equal(calls.length, 1, 'cached by default, as the community rooms want');
        assert.equal(cached1.ok && cached1.roomId, cached2.ok && cached2.roomId);
        // A fresh lookup does not write the cache either.
        calls.length = 0;
        await matrixClient.resolveRoomAlias('#other:test.local', { cache: false });
        await matrixClient.resolveRoomAlias('#other:test.local');
        assert.equal(calls.length, 2, 'the fresh lookup left nothing for the cached one');
    } finally {
        globalThis.fetch = plainFetch;
    }
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

test('botUserId hands its signal to whoami, and an aborted request caches nothing, so the next call asks again', async () => {
    const plainFetch = globalThis.fetch;
    const signals: Array<AbortSignal | undefined> = [];
    let answer: 'hang' | 'answer' = 'hang';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        assert.match(url, /\/_matrix\/client\/v3\/account\/whoami$/);
        signals.push(init?.signal ?? undefined);
        if (answer === 'hang') {
            // Settles only when the caller aborts, as fetch does.
            return new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
                    once: true,
                });
            });
        }
        return new Response(JSON.stringify({ user_id: '@notices-bot:test.local' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
    try {
        const controller = new AbortController();
        const asking = matrixClient.botUserId({ signal: controller.signal });
        controller.abort();
        assert.equal(await asking, undefined, 'an aborted whoami answers nothing');
        assert.equal(signals[0], controller.signal, 'the signal is handed to fetch');
        // Not the derived fallback, kept for the process: the next call asks.
        answer = 'answer';
        assert.equal(await matrixClient.botUserId(), '@notices-bot:test.local');
        assert.equal(signals.length, 2);
        // And that answer is cached.
        assert.equal(await matrixClient.botUserId(), '@notices-bot:test.local');
        assert.equal(signals.length, 2);
    } finally {
        globalThis.fetch = plainFetch;
    }
});
