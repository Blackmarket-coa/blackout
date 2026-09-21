/**
 * Moderation of inbound replies: the state machine and the platform's hand.
 *
 * A steward's decision is not a free-form write. Approve is only ever from
 * `pending`; reject can retract an approval; and a rejection is terminal —
 * rejected rows are on the purge schedule, and a platform takedown lands as a
 * rejection too, so nothing a steward can click may bring one back. Repeating
 * a decision is a no-op that leaves the original review intact.
 *
 * The platform's hand is `POST /:id/externals/:activityId/takedown`: admin
 * allowlist only, works on a stopped coalition, idempotent. And a stopped
 * coalition shows no approved replies, whatever their status says.
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
process.env.BLACKOUT_ADMIN_USERS = 'mod-admin';
process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { ingestExternalActivity, listApprovedActivity, newCampaignPostId } = await import(
    '../src/services/coalitionSync'
);
const { listDomainEvents } = await import('../src/modules/domain-events');

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

const ADMIN = 'mod-admin';
const FOUNDER = 'mod-founder';
const STEWARD = 'mod-steward';
for (const id of [ADMIN, FOUNDER, STEWARD]) ensureUser(id);

interface Activity {
    id: string;
    moderationStatus: string;
}

async function setup() {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ name: 'Moderated', mission: 'Read carefully' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };

    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(STEWARD),
    });
    const promoted = await app.request(`/v1/coalitions/${coalition.id}/members/${STEWARD}`, {
        method: 'PATCH',
        headers: auth(FOUNDER),
        body: JSON.stringify({ role: 'steward' }),
    });
    assert.equal(promoted.status, 200, await promoted.text());

    await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({
            platform: 'bluesky',
            authMode: 'shared',
            secret: BSKY_CREDENTIAL,
        }),
    });

    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ type: 'project', title: 'Fix the roof' }),
    });
    const { campaign } = (await campaignRes.json()) as { campaign: { id: string } };

    const post = db.upsertCoalitionCampaignPost({
        id: newCampaignPostId(),
        campaignId: campaign.id,
        coalitionId: coalition.id,
        platform: 'bluesky',
        direction: 'out',
        syncStatus: 'posted',
        externalPostId: 'at://did:plc:us/app.bsky.feed.post/1',
    });

    const ingested = ingestExternalActivity({
        campaignPostId: post.id,
        sourcePlatform: 'bluesky',
        externalAuthor: 'stranger.bsky.social',
        content: 'good luck with this',
    });
    assert.equal(ingested.ok, true);
    const reply = (ingested as { ok: true; value: { id: string } }).value;
    return { coalition, campaign, post, reply };
}

async function moderate(coalitionId: string, activityId: string, decision: string, as: string) {
    const res = await app.request(
        `/v1/coalitions/${coalitionId}/externals/${activityId}/${decision}`,
        {
            method: 'POST',
            headers: auth(as),
        }
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function takedown(coalitionId: string, activityId: string, as: string, reason = 'policy') {
    const res = await app.request(
        `/v1/coalitions/${coalitionId}/externals/${activityId}/takedown`,
        { method: 'POST', headers: auth(as), body: JSON.stringify({ reason }) }
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function threadReplies(coalitionId: string, campaignId: string) {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/thread`, {
        headers: auth(FOUNDER),
    });
    return {
        status: res.status,
        replies: ((await res.json()) as { replies?: Activity[] }).replies,
    };
}

const moderatedEventsFor = (activityId: string) =>
    listDomainEvents('coalitions').filter(
        (event) =>
            event.type === 'coalition.external.moderated' &&
            (event.payload as { activityId: string }).activityId === activityId
    );

const takedownEventsFor = (activityId: string) =>
    listDomainEvents('coalitions').filter(
        (event) =>
            event.type === 'coalition.external.taken_down' &&
            (event.payload as { activityId: string }).activityId === activityId
    );

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '1';
});

// --- the state machine -----------------------------------------------------

test('approve is idempotent: the second click changes nothing and writes no event', async () => {
    const { coalition, reply } = await setup();

    const first = await moderate(coalition.id, reply.id, 'approve', STEWARD);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal((first.body.activity as Activity).moderationStatus, 'approved');
    const reviewedAt = db.getCoalitionExternalActivity(reply.id)?.reviewedAt;
    assert.ok(reviewedAt, 'the first approval is stamped');
    assert.equal(moderatedEventsFor(reply.id).length, 1);

    const again = await moderate(coalition.id, reply.id, 'approve', FOUNDER);
    assert.equal(again.status, 200);
    assert.equal((again.body.activity as Activity).moderationStatus, 'approved');
    assert.equal(moderatedEventsFor(reply.id).length, 1, 'still one moderated event');
    const row = db.getCoalitionExternalActivity(reply.id);
    assert.equal(row?.reviewedAt, reviewedAt, 'the original review time stands');
    assert.equal(row?.reviewedBy, STEWARD, 'the original reviewer stands');
});

test('a rejection is terminal: approve afterwards is refused', async () => {
    const { coalition, reply } = await setup();

    const rejected = await moderate(coalition.id, reply.id, 'reject', STEWARD);
    assert.equal(rejected.status, 200);
    assert.equal((rejected.body.activity as Activity).moderationStatus, 'rejected');

    const approved = await moderate(coalition.id, reply.id, 'approve', STEWARD);
    assert.equal(approved.status, 409);
    assert.equal(approved.body.code, 'already_moderated');
    assert.equal(approved.body.status, 'rejected');
    assert.equal(db.getCoalitionExternalActivity(reply.id)?.moderationStatus, 'rejected');

    // Rejecting again is the same no-op approve-again is.
    const eventsBefore = moderatedEventsFor(reply.id).length;
    const again = await moderate(coalition.id, reply.id, 'reject', STEWARD);
    assert.equal(again.status, 200);
    assert.equal(moderatedEventsFor(reply.id).length, eventsBefore);
});

test('a steward can retract an approval', async () => {
    const { coalition, reply } = await setup();

    assert.equal((await moderate(coalition.id, reply.id, 'approve', STEWARD)).status, 200);
    const retracted = await moderate(coalition.id, reply.id, 'reject', STEWARD);
    assert.equal(retracted.status, 200);
    assert.equal((retracted.body.activity as Activity).moderationStatus, 'rejected');
    assert.equal(moderatedEventsFor(reply.id).length, 2, 'approve and reject each recorded');
});

// --- the platform's hand ---------------------------------------------------

test('only the platform can take a reply down, and the result cannot be approved back', async () => {
    const { coalition, reply } = await setup();

    const byFounder = await takedown(coalition.id, reply.id, FOUNDER);
    assert.equal(byFounder.status, 403, 'a founder is not the platform');
    const bySteward = await takedown(coalition.id, reply.id, STEWARD);
    assert.equal(bySteward.status, 403, 'nor is a steward');
    assert.equal(db.getCoalitionExternalActivity(reply.id)?.moderationStatus, 'pending');

    const down = await takedown(coalition.id, reply.id, ADMIN);
    assert.equal(down.status, 200, JSON.stringify(down.body));
    assert.equal((down.body.activity as Activity).moderationStatus, 'rejected');
    const row = db.getCoalitionExternalActivity(reply.id);
    assert.equal(row?.reviewedBy, ADMIN);
    assert.ok(row?.reviewedAt);
    assert.equal(takedownEventsFor(reply.id).length, 1);

    // The event names ids and the reason only — never the words or the author.
    const payload = takedownEventsFor(reply.id)[0].payload as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), [
        'activityId',
        'campaignId',
        'coalitionId',
        'moderatorId',
        'reason',
    ]);
    assert.equal(payload.moderatorId, ADMIN);

    const approved = await moderate(coalition.id, reply.id, 'approve', STEWARD);
    assert.equal(approved.status, 409);
    assert.equal(approved.body.code, 'already_moderated');

    const again = await takedown(coalition.id, reply.id, ADMIN);
    assert.equal(again.status, 200, 'idempotent');
    assert.equal((again.body.activity as Activity).moderationStatus, 'rejected');
    assert.equal(takedownEventsFor(reply.id).length, 1, 'no second event');
});

test('a taken-down reply leaves the thread', async () => {
    const { coalition, campaign, reply } = await setup();
    assert.equal((await moderate(coalition.id, reply.id, 'approve', STEWARD)).status, 200);

    const before = await threadReplies(coalition.id, campaign.id);
    assert.equal(before.status, 200);
    assert.deepEqual(
        before.replies?.map((r) => r.id),
        [reply.id],
        'approved, so shown'
    );

    assert.equal((await takedown(coalition.id, reply.id, ADMIN)).status, 200);

    const after = await threadReplies(coalition.id, campaign.id);
    assert.equal(after.status, 200);
    assert.deepEqual(after.replies, [], 'taken down, so gone');
});

test('a reply can be taken down after its coalition was', async () => {
    const { coalition, reply } = await setup();

    const coalitionDown = await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(ADMIN),
        body: JSON.stringify({ reason: 'policy' }),
    });
    assert.equal(coalitionDown.status, 200, await coalitionDown.text());

    const down = await takedown(coalition.id, reply.id, ADMIN);
    assert.equal(down.status, 200, JSON.stringify(down.body));
    assert.equal((down.body.activity as Activity).moderationStatus, 'rejected');
    assert.equal(db.getCoalitionExternalActivity(reply.id)?.reviewedBy, ADMIN);
});

test('a reply belongs to one coalition', async () => {
    const { reply } = await setup();
    const other = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ name: 'Elsewhere', mission: 'Not ours' }),
    });
    const { coalition: elsewhere } = (await other.json()) as { coalition: { id: string } };

    assert.equal((await takedown(elsewhere.id, reply.id, ADMIN)).status, 404);
    assert.equal((await moderate(elsewhere.id, reply.id, 'approve', FOUNDER)).status, 404);
    assert.equal(db.getCoalitionExternalActivity(reply.id)?.moderationStatus, 'pending');
});

// --- a stopped coalition shows nothing -------------------------------------

test('a stopped coalition shows no approved replies', async () => {
    const { coalition, campaign, reply } = await setup();
    assert.equal((await moderate(coalition.id, reply.id, 'approve', STEWARD)).status, 200);
    assert.equal(listApprovedActivity(campaign.id).length, 1);

    const coalitionDown = await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(ADMIN),
        body: JSON.stringify({ reason: 'policy' }),
    });
    assert.equal(coalitionDown.status, 200, await coalitionDown.text());

    // The row is untouched — the platform stopped the coalition, not the
    // steward's decision — but nothing of it is shown.
    assert.equal(db.getCoalitionExternalActivity(reply.id)?.moderationStatus, 'approved');
    assert.deepEqual(listApprovedActivity(campaign.id), []);

    // `getCampaign` still resolves the campaign, so the thread answers; the
    // replies on it do not.
    const thread = await threadReplies(coalition.id, campaign.id);
    assert.equal(thread.status, 200);
    assert.deepEqual(thread.replies, []);
});
