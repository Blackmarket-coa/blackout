/**
 * Automated cross-posting, and the adapters that make posting possible at all.
 *
 * Before this, `poster` defaulted to a stub answering `no_adapter` and nothing
 * in the repo could post anywhere: every platform the capabilities table marked
 * `apiPost: true` wrote a failed row. And nothing posted without a member
 * pressing share, so a coalition's reach was bounded by who happened to be
 * looking.
 *
 * What is pinned here is mostly what the automation REFUSES to do, because that
 * is where the risk is: posting as a member who is not in the room, announcing
 * the back catalogue on the day the flag flips, broadcasting a fundraising
 * appeal on a timer, or announcing the same milestone twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS =
    process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS ??
    'test:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { __setAutoPosterForTests, milestonesFor, sweepAutoCrossposts } = await import(
    '../src/services/coalitionAutoCrosspost'
);
const { __setAdapterFetchForTests, credentialLooksValid, postToPlatform } = await import(
    '../src/services/coalitionPlatformAdapters'
);
const { encryptSecret } = await import('../src/services/secretBox');
const { platformAllowsAuthMode, platformCanAutomate } = await import('@blackout/core');

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/123456789/abcDEF-ghi_JKL';

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@example.test`,
        passwordHash: 'hash',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${id}`,
    });
}

const LEAD = 'auto-lead';
ensureUser(LEAD);

async function setup(
    campaignBody: Record<string, unknown> = {},
    connectionBody: Record<string, unknown> = {}
) {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Autopost', mission: 'Say what happened' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };

    const connect = await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            platform: 'discord',
            authMode: 'shared',
            secret: DISCORD_WEBHOOK,
            ...connectionBody,
        }),
    });
    assert.equal(connect.status, 201, await connect.text());

    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'project', title: 'Fix the roof', ...campaignBody }),
    });
    const text = await campaignRes.text();
    assert.equal(campaignRes.status, 201, text);
    const { campaign } = JSON.parse(text) as { campaign: { id: string } };
    return { coalition, campaign };
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setAutoPosterForTests(null);
    __setAdapterFetchForTests(undefined);
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
    process.env.BLACKOUT_COALITION_AUTOPOST_ENABLED = '1';
});

// --- the gates -------------------------------------------------------------

test('both flags are required; either one off posts nothing', async () => {
    let posted = 0;
    __setAutoPosterForTests(async () => {
        posted += 1;
        return { ok: true, externalPostId: 'd1' };
    });
    await setup();

    delete process.env.BLACKOUT_COALITION_AUTOPOST_ENABLED;
    assert.deepEqual(await sweepAutoCrossposts(), {
        considered: 0,
        posted: 0,
        failed: 0,
        skipped: 0,
    });

    process.env.BLACKOUT_COALITION_AUTOPOST_ENABLED = '1';
    delete process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED;
    await sweepAutoCrossposts();
    assert.equal(posted, 0, 'credential custody gate still governs');
});

test('a coalition with no shared connection is never posted for', async () => {
    let posted = 0;
    __setAutoPosterForTests(async () => {
        posted += 1;
        return { ok: true };
    });
    // Bluesky allows personal mode; the automation still refuses to drive it.
    await setup({}, { platform: 'bluesky', authMode: 'personal', secret: undefined });
    await sweepAutoCrossposts();
    assert.equal(posted, 0, 'a member account is never driven unattended');
});

// --- fundraising is excluded ----------------------------------------------

test('money-asking campaigns are not announced on a timer', async () => {
    const seen: string[] = [];
    __setAutoPosterForTests(async (input) => {
        seen.push(input.text);
        return { ok: true };
    });

    for (const type of ['drive', 'goods_drive', 'mutual_aid']) {
        __resetCoalitionsForTests();
        await setup({ type, goalCents: 500_00 });
        await sweepAutoCrossposts();
    }
    assert.deepEqual(seen, [], 'a scheduler soliciting donations is a different thing entirely');

    // The same coalition announcing a project does post, so this is an
    // exclusion by type rather than the sweep being broken.
    __resetCoalitionsForTests();
    await setup({ type: 'project' });
    await sweepAutoCrossposts();
    assert.equal(seen.length, 1);
});

// --- milestones ------------------------------------------------------------

test('a launch is only news for a couple of days', () => {
    const now = Date.parse('2026-09-17T12:00:00.000Z');
    const fresh = {
        status: 'active',
        createdAt: new Date(now - 60_000).toISOString(),
    } as Parameters<typeof milestonesFor>[0];
    const stale = {
        status: 'active',
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    } as Parameters<typeof milestonesFor>[0];

    assert.deepEqual(milestonesFor(fresh, now), ['launched']);
    assert.deepEqual(
        milestonesFor(stale, now),
        [],
        'switching the flag on must not announce the back catalogue'
    );
});

test('reaching the goal and finishing outrank the launch, and only one is posted', () => {
    const now = Date.parse('2026-09-17T12:00:00.000Z');
    const reached = {
        status: 'active',
        createdAt: new Date(now - 60_000).toISOString(),
        goalCents: 1000,
        raisedCents: 1000,
    } as Parameters<typeof milestonesFor>[0];
    assert.deepEqual(milestonesFor(reached, now), ['goal_reached', 'launched']);

    const done = {
        status: 'completed',
        createdAt: new Date(now - 60_000).toISOString(),
    } as Parameters<typeof milestonesFor>[0];
    assert.equal(milestonesFor(done, now)[0], 'completed');
});

test('the same milestone is announced once, however many times the sweep runs', async () => {
    let posted = 0;
    __setAutoPosterForTests(async () => {
        posted += 1;
        return { ok: true, externalPostId: `d${posted}` };
    });
    await setup();

    await sweepAutoCrossposts();
    await sweepAutoCrossposts();
    await sweepAutoCrossposts();
    assert.equal(posted, 1, 'the post row is the idempotency record');
});

test('a failed announcement is retried, not treated as done', async () => {
    let attempts = 0;
    __setAutoPosterForTests(async () => {
        attempts += 1;
        return attempts === 1 ? { ok: false, error: 'discord_503' } : { ok: true };
    });
    const { campaign } = await setup();

    await sweepAutoCrossposts();
    assert.equal(attempts, 1);
    const failedRow = db
        .listCoalitionCampaignPosts({ campaignId: campaign.id })
        .find((row) => row.milestone === 'launched');
    assert.equal(failedRow?.syncStatus, 'failed');
    assert.equal(failedRow?.error, 'discord_503');

    await sweepAutoCrossposts();
    assert.equal(attempts, 2, 'retried');
    await sweepAutoCrossposts();
    assert.equal(attempts, 2, 'and then left alone');
});

test('an automated post carries no author, because no person made it', async () => {
    __setAutoPosterForTests(async () => ({ ok: true, externalPostId: 'd1' }));
    const { campaign } = await setup();
    await sweepAutoCrossposts();

    const row = db
        .listCoalitionCampaignPosts({ campaignId: campaign.id })
        .find((r) => r.milestone === 'launched');
    assert.ok(row);
    assert.equal(row.authorUserId, undefined);
    assert.equal(row.syncStatus, 'posted');
    assert.equal(row.externalPostId, 'd1');
});

test('a stopped coalition is not announced for', async () => {
    let posted = 0;
    __setAutoPosterForTests(async () => {
        posted += 1;
        return { ok: true };
    });
    const { coalition } = await setup();
    const archived = await app.request(`/v1/coalitions/${coalition.id}/archive`, {
        method: 'POST',
        headers: auth(LEAD),
    });
    assert.equal(archived.status, 200, await archived.text());

    await sweepAutoCrossposts();
    assert.equal(posted, 0);
});

// --- the connection layer's own constraints --------------------------------

test('Discord refuses a personal connection outright', async () => {
    assert.equal(platformAllowsAuthMode('discord', 'personal'), false);
    assert.equal(platformAllowsAuthMode('discord', 'shared'), true);

    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Modes', mission: 'x' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };
    const res = await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ platform: 'discord', authMode: 'personal' }),
    });
    // A personal Discord connection can only be driven by a user token, which
    // is self-botting — terminate-on-sight under Discord's terms.
    assert.equal(res.status, 400, await res.text());
});

test('a credential that is not the right shape is refused at intake', async () => {
    assert.equal(credentialLooksValid('discord', DISCORD_WEBHOOK), true);
    assert.equal(credentialLooksValid('discord', 'https://evil.example/api/webhooks/1/x'), false);
    assert.equal(credentialLooksValid('discord', 'not-a-url'), false);
    assert.equal(credentialLooksValid('bluesky', 'me.bsky.social|abcd-efgh'), true);
    assert.equal(credentialLooksValid('bluesky', 'just-a-token'), false);
    assert.equal(credentialLooksValid('mastodon', 'https://mas.to|tok'), true);
    assert.equal(credentialLooksValid('mastodon', 'http://mas.to|tok'), false);

    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Shapes', mission: 'x' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };
    const res = await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            platform: 'discord',
            authMode: 'shared',
            secret: 'https://evil.example/api/webhooks/1/x',
        }),
    });
    assert.equal(res.status, 400, 'a coalition cannot be pointed at a third party');
});

// --- the adapters ----------------------------------------------------------

test('X is declared but honestly unimplemented', async () => {
    assert.equal(platformCanAutomate('x'), false);
    const result = await postToPlatform({
        platform: 'x',
        text: 'hello',
        url: 'https://example.test/c/1',
        credentialRef: 'anything',
        credentialAad: 'aad',
    });
    assert.deepEqual(result, { ok: false, error: 'no_adapter' });
});

test('the Discord adapter posts the text and returns the message id', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    __setAdapterFetchForTests((async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ id: '999' }), { status: 200 });
    }) as unknown as typeof fetch);

    const aad = 'coalition_connection:c1:discord';
    const result = await postToPlatform({
        platform: 'discord',
        text: 'Autopost just started Fix the roof. https://example.test/c/1',
        url: 'https://example.test/c/1',
        credentialRef: encryptSecret(DISCORD_WEBHOOK, { aad }),
        credentialAad: aad,
    });

    assert.deepEqual(result, { ok: true, externalPostId: '999' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith(DISCORD_WEBHOOK), 'posted to the stored webhook');
    assert.match(String((calls[0].body as { content: string }).content), /Fix the roof/);
});

test('a credential sealed for another connection cannot be replayed', async () => {
    __setAdapterFetchForTests((async () => new Response('{}', { status: 200 })) as typeof fetch);
    const result = await postToPlatform({
        platform: 'discord',
        text: 'hello',
        url: 'https://example.test/c/1',
        credentialRef: encryptSecret(DISCORD_WEBHOOK, {
            aad: 'coalition_connection:someone-else:discord',
        }),
        credentialAad: 'coalition_connection:c1:discord',
    });
    assert.deepEqual(result, { ok: false, error: 'credential_unreadable' });
});

test('an adapter failure is a value, and never carries the credential', async () => {
    __setAdapterFetchForTests(
        (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    );
    const aad = 'coalition_connection:c1:discord';
    const result = await postToPlatform({
        platform: 'discord',
        text: 'hello',
        url: 'https://example.test/c/1',
        credentialRef: encryptSecret(DISCORD_WEBHOOK, { aad }),
        credentialAad: aad,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'discord_401');
    assert.doesNotMatch(String(result.error), /abcDEF/, 'no part of the secret is in the error');
});

test('the Bluesky adapter indexes its link facet in bytes, not code units', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    __setAdapterFetchForTests((async (url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        if (String(url).includes('createSession')) {
            return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'did:plc:abc' }), {
                status: 200,
            });
        }
        return new Response(JSON.stringify({ uri: 'at://did:plc:abc/post/1' }), { status: 200 });
    }) as unknown as typeof fetch);

    // A multi-byte character before the URL. A code-unit offset would point
    // into the middle of the link and it would silently stop being clickable.
    const url = 'https://example.test/c/1';
    const text = `Coalition 🌱 just started Fix the roof. ${url}`;
    const aad = 'coalition_connection:c1:bluesky';
    const result = await postToPlatform({
        platform: 'bluesky',
        text,
        url,
        credentialRef: encryptSecret('me.bsky.social|app-pass', { aad }),
        credentialAad: aad,
    });

    assert.deepEqual(result, { ok: true, externalPostId: 'at://did:plc:abc/post/1' });
    const record = (
        bodies[1] as {
            record: { facets: Array<{ index: { byteStart: number; byteEnd: number } }> };
        }
    ).record;
    const { byteStart, byteEnd } = record.facets[0].index;
    const bytes = new TextEncoder().encode(text);
    assert.equal(
        new TextDecoder().decode(bytes.slice(byteStart, byteEnd)),
        url,
        'the facet covers exactly the URL'
    );
});
