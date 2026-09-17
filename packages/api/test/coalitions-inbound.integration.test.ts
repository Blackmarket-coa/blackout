/**
 * The inbound half: reading back what a coalition's posts got.
 *
 * `ingestExternalActivity` was implemented, tested, and called by nothing — no
 * webhook, no poller, no subscriber. The moderation queue was wired to a queue
 * nothing in production could fill.
 *
 * What is pinned here is the split the whole design rests on. Counts are signal
 * and flow in unmoderated; words are a stranger's and are quarantined unless
 * the coalition itself chose otherwise. And the hardening: a reply must have
 * arrived on the platform its post went out on, a stopped coalition takes
 * nothing, and text is clamped rather than trusted.
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
const { __resetCoalitionsForTests, takeDownCoalition } = await import(
    '../src/services/coalitionNetworkStore'
);
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { ingestExternalActivity, newCampaignPostId } = await import('../src/services/coalitionSync');
const { __setInboundFetchForTests, sweepInboundActivity } = await import(
    '../src/services/coalitionInboundSync'
);

const BSKY_CREDENTIAL = 'coalition.bsky.social|app-pass';

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

const LEAD = 'in-lead';
ensureUser(LEAD);

async function setup(coalitionPatch: Record<string, unknown> = {}) {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Inbound', mission: 'Listen back' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };

    await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            platform: 'bluesky',
            authMode: 'shared',
            secret: BSKY_CREDENTIAL,
        }),
    });

    if (Object.keys(coalitionPatch).length > 0) {
        const patched = await app.request(`/v1/coalitions/${coalition.id}`, {
            method: 'PATCH',
            headers: auth(LEAD),
            body: JSON.stringify(coalitionPatch),
        });
        assert.equal(patched.status, 200, await patched.text());
    }

    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'project', title: 'Fix the roof' }),
    });
    const { campaign } = (await campaignRes.json()) as { campaign: { id: string } };

    // A post this server made. The sweep only ever reads back our own.
    const post = db.upsertCoalitionCampaignPost({
        id: newCampaignPostId(),
        campaignId: campaign.id,
        coalitionId: coalition.id,
        platform: 'bluesky',
        direction: 'out',
        syncStatus: 'posted',
        externalPostId: 'at://did:plc:us/app.bsky.feed.post/1',
    });
    return { coalition, campaign, post };
}

/** A Bluesky thread read: three likes, two reposts, one reply. */
function blueskyThread(replies: Array<{ uri: string; handle: string; text: string }>) {
    return (async (url: string) => {
        if (String(url).includes('createSession')) {
            return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'did:plc:us' }), {
                status: 200,
            });
        }
        return new Response(
            JSON.stringify({
                thread: {
                    post: { likeCount: 3, repostCount: 2, replyCount: replies.length },
                    replies: replies.map((r) => ({
                        post: {
                            uri: r.uri,
                            author: { handle: r.handle },
                            record: { text: r.text, createdAt: '2026-09-17T10:00:00.000Z' },
                        },
                    })),
                },
            }),
            { status: 200 }
        );
    }) as unknown as typeof fetch;
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setInboundFetchForTests(undefined);
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '1';
});

// --- the gate --------------------------------------------------------------

test('nothing is read while two-way sync is off', async () => {
    let called = 0;
    __setInboundFetchForTests((async () => {
        called += 1;
        return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    await setup();

    delete process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED;
    assert.deepEqual(await sweepInboundActivity(), { read: 0, ingested: 0, failed: 0 });
    assert.equal(called, 0);
});

// --- numbers flow, words wait ----------------------------------------------

test('counts land unmoderated and replies land quarantined, from one read', async () => {
    const { coalition, campaign, post } = await setup();
    __setInboundFetchForTests(
        blueskyThread([
            { uri: 'at://r/1', handle: 'stranger.bsky.social', text: 'good luck with this' },
        ])
    );

    const result = await sweepInboundActivity();
    assert.deepEqual(result, { read: 1, ingested: 1, failed: 0 });

    // Numbers: straight in, no steward involved.
    const engagement = db.getCampaignEngagement(post.id);
    assert.equal(engagement?.likes, 3);
    assert.equal(engagement?.reshares, 2);
    assert.equal(engagement?.replies, 1);

    // Words: waiting.
    const activity = db.listCoalitionExternalActivity({ campaignId: campaign.id });
    assert.equal(activity.length, 1);
    assert.equal(activity[0].moderationStatus, 'pending');
    assert.equal(activity[0].externalAuthor, 'stranger.bsky.social');

    // And the counts are readable over the API without a moderation step.
    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/engagement`,
        { headers: auth(LEAD) }
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { totals: { likes: number; replies: number } };
    assert.equal(body.totals.likes, 3);
    assert.equal(body.totals.replies, 1);
});

test('a coalition can choose for itself that replies appear as they arrive', async () => {
    const { campaign } = await setup({ externalReplyPolicy: 'open' });
    __setInboundFetchForTests(
        blueskyThread([{ uri: 'at://r/1', handle: 'friend.bsky.social', text: 'on my way' }])
    );
    await sweepInboundActivity();

    const activity = db.listCoalitionExternalActivity({ campaignId: campaign.id });
    assert.equal(activity[0]?.moderationStatus, 'approved');
});

test('a coalition can refuse replies and still be counted', async () => {
    const { campaign, post } = await setup({ externalReplyPolicy: 'off' });
    __setInboundFetchForTests(
        blueskyThread([{ uri: 'at://r/1', handle: 'stranger.bsky.social', text: 'hello' }])
    );
    const result = await sweepInboundActivity();

    assert.equal(result.read, 1, 'still read');
    assert.equal(result.ingested, 0, 'but no comment section');
    assert.equal(db.getCampaignEngagement(post.id)?.likes, 3, 'a number is not a comment');
    assert.equal(db.listCoalitionExternalActivity({ campaignId: campaign.id }).length, 0);
});

test('re-reading updates the counts rather than accumulating rows', async () => {
    const { post } = await setup();
    __setInboundFetchForTests(blueskyThread([]));
    await sweepInboundActivity();
    assert.equal(db.getCampaignEngagement(post.id)?.likes, 3);

    // A withdrawn like must be able to lower the number.
    __setInboundFetchForTests((async (url: string) => {
        if (String(url).includes('createSession')) {
            return new Response(JSON.stringify({ accessJwt: 'j', did: 'did:plc:us' }), {
                status: 200,
            });
        }
        return new Response(
            JSON.stringify({
                thread: { post: { likeCount: 1, repostCount: 0, replyCount: 0 }, replies: [] },
            }),
            { status: 200 }
        );
    }) as unknown as typeof fetch);
    await sweepInboundActivity();

    assert.equal(db.getCampaignEngagement(post.id)?.likes, 1);
    assert.equal(db.listCampaignEngagement({}).length, 1, 'one current reading, not a ledger');
});

test('the same reply is ingested once however often it is read', async () => {
    const { campaign } = await setup();
    __setInboundFetchForTests(
        blueskyThread([{ uri: 'at://r/1', handle: 'stranger.bsky.social', text: 'hello' }])
    );
    await sweepInboundActivity();
    await sweepInboundActivity();
    assert.equal(db.listCoalitionExternalActivity({ campaignId: campaign.id }).length, 1);
});

// --- hardening -------------------------------------------------------------

test('a reply must have arrived on the platform its post went out on', async () => {
    const { post } = await setup();
    const wrongPlatform = ingestExternalActivity({
        campaignPostId: post.id,
        // The post went out on Bluesky.
        sourcePlatform: 'mastodon',
        externalAuthor: 'someone',
        content: 'filed against the wrong post',
    });
    assert.equal(wrongPlatform.ok, false);
});

test('a stopped coalition takes nothing further', async () => {
    const { coalition, post } = await setup();
    assert.equal((await takeDownCoalition(coalition.id, 'moderator', 'policy')).ok, true);

    const refused = ingestExternalActivity({
        campaignPostId: post.id,
        sourcePlatform: 'bluesky',
        externalAuthor: 'someone',
        content: 'still talking',
    });
    assert.equal(refused.ok, false);
});

test('author and content are clamped, not trusted', async () => {
    const { campaign, post } = await setup();
    const outcome = ingestExternalActivity({
        campaignPostId: post.id,
        sourcePlatform: 'bluesky',
        externalAuthor: 'a'.repeat(5000),
        content: 'b'.repeat(50_000),
    });
    assert.equal(outcome.ok, true);

    const row = db.listCoalitionExternalActivity({ campaignId: campaign.id })[0];
    assert.ok(row.externalAuthor.length <= 120, 'author clamped');
    assert.ok(row.content.length <= 2000, 'content clamped');
});

test('a platform that does not do inbound is refused', async () => {
    const { coalition, campaign } = await setup();
    // Instagram is `inbound: false`; a receiver claiming otherwise is refused.
    const post = db.upsertCoalitionCampaignPost({
        id: newCampaignPostId(),
        campaignId: campaign.id,
        coalitionId: coalition.id,
        platform: 'instagram',
        direction: 'out',
        syncStatus: 'posted',
        externalPostId: 'ig-1',
    });
    const refused = ingestExternalActivity({
        campaignPostId: post.id,
        sourcePlatform: 'instagram',
        externalAuthor: 'someone',
        content: 'hello',
    });
    assert.equal(refused.ok, false);
});

test('only posts this server made are read back', async () => {
    const { campaign, coalition } = await setup();
    // An inbound row, and an outbound one that never posted. Neither is ours to read.
    db.upsertCoalitionCampaignPost({
        id: newCampaignPostId(),
        campaignId: campaign.id,
        coalitionId: coalition.id,
        platform: 'bluesky',
        direction: 'in',
        syncStatus: 'received',
        externalPostId: 'at://someone-elses/1',
    });
    db.upsertCoalitionCampaignPost({
        id: newCampaignPostId(),
        campaignId: campaign.id,
        coalitionId: coalition.id,
        platform: 'bluesky',
        direction: 'out',
        syncStatus: 'failed',
        externalPostId: 'at://never-posted/1',
    });

    const readUris: string[] = [];
    __setInboundFetchForTests((async (url: string) => {
        const target = String(url);
        if (target.includes('createSession')) {
            return new Response(JSON.stringify({ accessJwt: 'j', did: 'did:plc:us' }), {
                status: 200,
            });
        }
        readUris.push(target);
        return new Response(
            JSON.stringify({
                thread: { post: { likeCount: 0, repostCount: 0, replyCount: 0 }, replies: [] },
            }),
            { status: 200 }
        );
    }) as unknown as typeof fetch);

    await sweepInboundActivity();
    assert.equal(readUris.length, 1, 'exactly the one post we actually published');
    assert.match(readUris[0], /app\.bsky\.feed\.post%2F1/);
});
