/**
 * Retention for what strangers wrote back.
 *
 * A reply read in from a third-party platform is somebody else's speech. The
 * coalition may show it for a while; it may not hold it forever. What is
 * pinned here: each moderation status has its own window, rejected rows age
 * from the decision rather than from arrival, the windows are configurable
 * but never zero and never broken by a bad value, a row whose age cannot be
 * read is purged rather than kept, the sweep runs with inbound sync switched
 * off, and the counts a coalition earned are never touched.
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
const { newCampaignPostId } = await import('../src/services/coalitionSync');
const {
    retentionWindows,
    sweepExternalActivityRetention,
    DEFAULT_PENDING_DAYS,
    DEFAULT_REJECTED_DAYS,
    DEFAULT_APPROVED_DAYS,
    MIN_WINDOW_DAYS,
} = await import('../src/services/coalitionExternalRetention');
const { INBOUND_READ_WINDOW_DAYS } = await import('../src/services/coalitionInboundSync');
const scheduler = await import('../src/services/coalitionExternalRetentionScheduler');

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

const LEAD = 'ret-lead';
ensureUser(LEAD);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const daysAgo = (days: number): string => new Date(NOW - days * DAY_MS).toISOString();

const RETENTION_ENV = [
    'BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS',
    'BLACKOUT_COALITION_EXTERNAL_RETENTION_REJECTED_DAYS',
    'BLACKOUT_COALITION_EXTERNAL_RETENTION_APPROVED_DAYS',
] as const;

let seq = 0;

/** A coalition, a campaign and one post this server made, over the real API. */
async function setup() {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Retention', mission: 'Keep only what is ours' }),
    });
    const createdBody = await created.text();
    assert.equal(created.status, 201, createdBody);
    const { coalition } = JSON.parse(createdBody) as { coalition: { id: string } };

    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'project', title: 'Fix the roof' }),
    });
    const campaignBody = await campaignRes.text();
    assert.equal(campaignRes.status, 201, campaignBody);
    const { campaign } = JSON.parse(campaignBody) as { campaign: { id: string } };

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

type Seeded = Awaited<ReturnType<typeof setup>>;

/**
 * A reply row with a controlled age. Written straight to the store because
 * ingestion stamps `receivedAt` with the wall clock, and this suite needs
 * rows that are days old.
 */
function seedReply(
    ctx: Seeded,
    input: {
        moderationStatus: 'pending' | 'approved' | 'rejected';
        receivedAt: string;
        reviewedAt?: string;
    }
): string {
    seq += 1;
    const id = `ext-${seq}`;
    db.upsertCoalitionExternalActivity({
        id,
        campaignPostId: ctx.post.id,
        campaignId: ctx.campaign.id,
        coalitionId: ctx.coalition.id,
        sourcePlatform: 'bluesky',
        externalAuthor: `someone-${seq}.bsky.social`,
        externalId: `at://r/${seq}`,
        content: 'a reply',
        moderationStatus: input.moderationStatus,
        receivedAt: input.receivedAt,
        ...(input.reviewedAt ? { reviewedAt: input.reviewedAt, reviewedBy: LEAD } : {}),
    });
    return id;
}

const has = (id: string): boolean => db.getCoalitionExternalActivity(id) !== undefined;

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    scheduler.stopCoalitionExternalRetentionScheduler();
    for (const key of RETENTION_ENV) delete process.env[key];
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '1';
});

// --- windows ----------------------------------------------------------------

test('defaults: 30 / 30 / 365 days', () => {
    assert.deepEqual(retentionWindows({}), {
        pendingDays: DEFAULT_PENDING_DAYS,
        rejectedDays: DEFAULT_REJECTED_DAYS,
        approvedDays: DEFAULT_APPROVED_DAYS,
    });
    assert.deepEqual(retentionWindows({}), {
        pendingDays: 30,
        rejectedDays: 30,
        approvedDays: 365,
    });
});

test('env override changes the window', () => {
    const windows = retentionWindows({
        BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS: '45',
        BLACKOUT_COALITION_EXTERNAL_RETENTION_REJECTED_DAYS: '60',
        BLACKOUT_COALITION_EXTERNAL_RETENTION_APPROVED_DAYS: '400',
    });
    assert.deepEqual(windows, { pendingDays: 45, rejectedDays: 60, approvedDays: 400 });
});

test("no window can be shorter than the poller's read window", () => {
    // A rejected reply purged while its post is still being re-read would be
    // ingested again as pending, so a shorter window is raised, not honoured.
    const windows = retentionWindows({
        BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS: '1',
        BLACKOUT_COALITION_EXTERNAL_RETENTION_REJECTED_DAYS: '7',
        BLACKOUT_COALITION_EXTERNAL_RETENTION_APPROVED_DAYS: '29',
    });
    assert.deepEqual(windows, {
        pendingDays: MIN_WINDOW_DAYS,
        rejectedDays: MIN_WINDOW_DAYS,
        approvedDays: MIN_WINDOW_DAYS,
    });
    assert.equal(MIN_WINDOW_DAYS, INBOUND_READ_WINDOW_DAYS);
});

test('a value that is not a positive integer falls back to the default for that key', () => {
    const windows = retentionWindows({
        BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS: 'abc',
        BLACKOUT_COALITION_EXTERNAL_RETENTION_REJECTED_DAYS: '0',
        BLACKOUT_COALITION_EXTERNAL_RETENTION_APPROVED_DAYS: '-5',
    });
    assert.deepEqual(windows, { pendingDays: 30, rejectedDays: 30, approvedDays: 365 });

    // Never zero, whatever is thrown at it.
    for (const bad of ['', ' ', '1.5', 'NaN', 'Infinity', '0x10', '10abc']) {
        const w = retentionWindows({ BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS: bad });
        assert.equal(w.pendingDays, 30, `fallback for ${JSON.stringify(bad)}`);
    }
});

// --- the sweep, per status ----------------------------------------------------

test('pending: past-due rows are purged, in-window rows are kept', async () => {
    const ctx = await setup();
    const old = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(31) });
    const fresh = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(29) });

    const result = sweepExternalActivityRetention(NOW);
    assert.deepEqual(result, {
        scanned: 2,
        purged: { pending: 1, rejected: 0, approved: 0 },
    });
    assert.equal(has(old), false);
    assert.equal(has(fresh), true);
});

test('rejected: past-due rows are purged, in-window rows are kept', async () => {
    const ctx = await setup();
    const old = seedReply(ctx, {
        moderationStatus: 'rejected',
        receivedAt: daysAgo(40),
        reviewedAt: daysAgo(31),
    });
    const fresh = seedReply(ctx, {
        moderationStatus: 'rejected',
        receivedAt: daysAgo(40),
        reviewedAt: daysAgo(29),
    });

    const result = sweepExternalActivityRetention(NOW);
    assert.deepEqual(result.purged, { pending: 0, rejected: 1, approved: 0 });
    assert.equal(has(old), false);
    assert.equal(has(fresh), true);
});

test('rejected rows age from the decision, not from arrival', async () => {
    const ctx = await setup();
    // Arrived long past the rejected window, but only refused yesterday: the
    // steward's decision is what starts the clock.
    const recentlyRefused = seedReply(ctx, {
        moderationStatus: 'rejected',
        receivedAt: daysAgo(200),
        reviewedAt: daysAgo(1),
    });
    // The same arrival, as a pending row, would already be gone.
    const neverReviewed = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(200) });
    // No review stamp at all: falls back to arrival.
    const unstamped = seedReply(ctx, { moderationStatus: 'rejected', receivedAt: daysAgo(200) });

    sweepExternalActivityRetention(NOW);
    assert.equal(has(recentlyRefused), true, 'ages from reviewedAt');
    assert.equal(has(neverReviewed), false);
    assert.equal(has(unstamped), false, 'no reviewedAt: ages from receivedAt');
});

test('approved: past-due rows are purged, in-window rows are kept', async () => {
    const ctx = await setup();
    const old = seedReply(ctx, { moderationStatus: 'approved', receivedAt: daysAgo(366) });
    const fresh = seedReply(ctx, { moderationStatus: 'approved', receivedAt: daysAgo(364) });
    // Approved is the long window: a row that would be gone as pending stays.
    const midlife = seedReply(ctx, { moderationStatus: 'approved', receivedAt: daysAgo(100) });

    const result = sweepExternalActivityRetention(NOW);
    assert.deepEqual(result.purged, { pending: 0, rejected: 0, approved: 1 });
    assert.equal(has(old), false);
    assert.equal(has(fresh), true);
    assert.equal(has(midlife), true);
});

test('an approved row is not re-anchored by a review stamp', async () => {
    const ctx = await setup();
    // Approved yesterday, but the reply itself arrived past the approved
    // window. Approval does not restart the clock; arrival does.
    const row = seedReply(ctx, {
        moderationStatus: 'approved',
        receivedAt: daysAgo(400),
        reviewedAt: daysAgo(1),
    });
    sweepExternalActivityRetention(NOW);
    assert.equal(has(row), false);
});

test('the boundary is strictly past due: exactly on the window is kept', async () => {
    const ctx = await setup();
    const onTheLine = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(30) });
    sweepExternalActivityRetention(NOW);
    assert.equal(has(onTheLine), true);
});

// --- configuration -------------------------------------------------------------

test('an env override is what the sweep actually uses', async () => {
    const ctx = await setup();
    process.env.BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS = '40';
    const olderThanOverride = seedReply(ctx, {
        moderationStatus: 'pending',
        receivedAt: daysAgo(41),
    });
    const olderThanDefaultOnly = seedReply(ctx, {
        moderationStatus: 'pending',
        receivedAt: daysAgo(35),
    });

    sweepExternalActivityRetention(NOW);
    assert.equal(has(olderThanOverride), false);
    assert.equal(has(olderThanDefaultOnly), true);
});

test('garbage env values leave the sweep on its defaults', async () => {
    const ctx = await setup();
    process.env.BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS = 'abc';
    process.env.BLACKOUT_COALITION_EXTERNAL_RETENTION_REJECTED_DAYS = '0';
    process.env.BLACKOUT_COALITION_EXTERNAL_RETENTION_APPROVED_DAYS = '-5';

    // Each would survive its default window and be purged under any zero or
    // negative one.
    const pending = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(10) });
    const rejected = seedReply(ctx, {
        moderationStatus: 'rejected',
        receivedAt: daysAgo(10),
        reviewedAt: daysAgo(10),
    });
    const approved = seedReply(ctx, { moderationStatus: 'approved', receivedAt: daysAgo(10) });

    const result = sweepExternalActivityRetention(NOW);
    assert.deepEqual(result, { scanned: 3, purged: { pending: 0, rejected: 0, approved: 0 } });
    assert.equal(has(pending), true);
    assert.equal(has(rejected), true);
    assert.equal(has(approved), true);
});

// --- hardening -------------------------------------------------------------------

test('an unparsable anchor is purged, not kept forever', async () => {
    const ctx = await setup();
    const garbageArrival = seedReply(ctx, {
        moderationStatus: 'pending',
        receivedAt: 'not a timestamp',
    });
    const garbageReview = seedReply(ctx, {
        moderationStatus: 'rejected',
        receivedAt: daysAgo(1),
        reviewedAt: 'yesterday-ish',
    });
    const emptyArrival = seedReply(ctx, { moderationStatus: 'approved', receivedAt: '' });

    const result = sweepExternalActivityRetention(NOW);
    assert.deepEqual(result.purged, { pending: 1, rejected: 1, approved: 1 });
    assert.equal(has(garbageArrival), false);
    assert.equal(has(garbageReview), false);
    assert.equal(has(emptyArrival), false);
});

test('the sweep runs with inbound sync unset or off', async () => {
    const ctx = await setup();
    const a = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(31) });
    delete process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED;
    assert.deepEqual(sweepExternalActivityRetention(NOW).purged, {
        pending: 1,
        rejected: 0,
        approved: 0,
    });
    assert.equal(has(a), false);

    const b = seedReply(ctx, { moderationStatus: 'pending', receivedAt: daysAgo(31) });
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '0';
    assert.equal(sweepExternalActivityRetention(NOW).purged.pending, 1);
    assert.equal(has(b), false);
});

test('engagement counts for the same post survive a purge', async () => {
    const ctx = await setup();
    db.upsertCampaignEngagement({
        id: ctx.post.id,
        campaignPostId: ctx.post.id,
        campaignId: ctx.campaign.id,
        coalitionId: ctx.coalition.id,
        platform: 'bluesky',
        likes: 3,
        reshares: 2,
        replies: 1,
        clicks: 0,
        lastReadAt: daysAgo(400),
    });
    const reply = seedReply(ctx, { moderationStatus: 'approved', receivedAt: daysAgo(400) });

    sweepExternalActivityRetention(NOW);
    assert.equal(has(reply), false);
    const engagement = db.getCampaignEngagement(ctx.post.id);
    assert.equal(engagement?.likes, 3, 'a number is not a comment');
    assert.equal(engagement?.replies, 1, 'the count is what the platform reported');
});

test('an empty table is a no-op', () => {
    assert.deepEqual(sweepExternalActivityRetention(NOW), {
        scanned: 0,
        purged: { pending: 0, rejected: 0, approved: 0 },
    });
});

// --- scheduler --------------------------------------------------------------------

test('scheduler: the first sweep runs at start, not one interval later', async () => {
    const ctx = await setup();
    const stale = seedReply(ctx, { moderationStatus: 'rejected', receivedAt: daysAgo(400) });
    // An interval long enough that only a start-time pass could have purged it.
    const handle = scheduler.startCoalitionExternalRetentionScheduler(60 * 60 * 1000);
    try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(has(stale), false, 'a restart-prone process still discharges retention');
    } finally {
        handle.stop();
    }
});

test('scheduler: an interval past the timer limit is clamped, never wrapped to 1 ms', () => {
    assert.equal(scheduler.MAX_TIMER_MS, 2_147_483_647);
    const handle = scheduler.startCoalitionExternalRetentionScheduler(Number.MAX_SAFE_INTEGER);
    assert.equal(scheduler.isCoalitionExternalRetentionSchedulerRunning(), true);
    handle.stop();
});

test('scheduler: idempotent start; stop clears the timer', () => {
    assert.equal(scheduler.isCoalitionExternalRetentionSchedulerRunning(), false);
    const a = scheduler.startCoalitionExternalRetentionScheduler(60_000);
    assert.equal(scheduler.isCoalitionExternalRetentionSchedulerRunning(), true);
    // Starting twice hands back the same stop rather than a second timer.
    const b = scheduler.startCoalitionExternalRetentionScheduler(60_000);
    assert.equal(a.stop, b.stop);
    a.stop();
    assert.equal(scheduler.isCoalitionExternalRetentionSchedulerRunning(), false);
    // Re-startable after stop.
    const c = scheduler.startCoalitionExternalRetentionScheduler(60_000);
    assert.equal(scheduler.isCoalitionExternalRetentionSchedulerRunning(), true);
    c.stop();
    assert.equal(scheduler.isCoalitionExternalRetentionSchedulerRunning(), false);
    assert.equal(scheduler.DEFAULT_INTERVAL_MS, 24 * 60 * 60 * 1000);
});
