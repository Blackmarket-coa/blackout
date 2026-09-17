/**
 * Closing the funnel: where a visitor came from, and nothing about who they are.
 *
 * The posted campaign URL used to carry no attribution at all — one identical
 * link for every sharer on every platform — so a coalition could not tell
 * whether any of its posting worked, and a stranger who clicked landed on a
 * "Signed out" card that never named the campaign.
 *
 * What is pinned here is as much about what is NOT recorded as what is. There
 * is no visitor identifier anywhere in this design, and a founder is served
 * totals rather than a list of who arrived — TRUST.md §2 says inbound
 * connections are counted and not listed, and a per-visitor table would be
 * that list.
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
process.env.BLACKOUT_PUBLIC_BASE_URL = 'https://theblackout.test';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { campaignAttributionTotals, mintAttributionRef, readAttributionRef, withAttribution } =
    await import('../src/services/coalitionAttribution');

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

const LEAD = 'attr-lead';
const VISITOR = 'attr-visitor';
for (const id of [LEAD, VISITOR]) ensureUser(id);

async function setup() {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Attribution', mission: 'Find out what worked' }),
    });
    const { coalition } = (await created.json()) as {
        coalition: { id: string; slug: string };
    };
    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Coats for winter', goalCents: 100_000 }),
    });
    const { campaign } = (await campaignRes.json()) as { campaign: { id: string } };
    return { coalition, campaign };
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
});

// --- the token -------------------------------------------------------------

test('a ref round-trips the campaign, the channel and the sharer', () => {
    const ref = mintAttributionRef({
        campaignId: 'camp_1',
        channel: 'mastodon',
        sharerUserId: LEAD,
    });
    assert.ok(ref);
    const claim = readAttributionRef(ref);
    assert.equal(claim?.campaignId, 'camp_1');
    assert.equal(claim?.channel, 'mastodon');
    assert.equal(claim?.sharerUserId, LEAD);
});

test('a ref says nothing about the visitor, because it is minted before one exists', () => {
    const ref = mintAttributionRef({ campaignId: 'camp_1', channel: 'bluesky' });
    assert.ok(ref);
    const decoded = JSON.parse(
        Buffer.from(ref.slice(0, ref.indexOf('.')), 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    // Exactly the campaign, the channel and the issue time. Nothing else.
    assert.deepEqual(Object.keys(decoded).sort(), ['c', 'h', 't']);
});

test('a tampered ref is refused, so a referral cannot be forged', () => {
    const ref = mintAttributionRef({ campaignId: 'camp_1', channel: 'x' });
    assert.ok(ref);
    const [payload, signature] = ref.split('.');

    // A different campaign under the same signature.
    const forgedPayload = Buffer.from(
        JSON.stringify({ c: 'camp_other', h: 'x', t: Math.floor(Date.now() / 1000) })
    ).toString('base64url');
    assert.equal(readAttributionRef(`${forgedPayload}.${signature}`), null);

    // A mangled signature.
    assert.equal(readAttributionRef(`${payload}.${'a'.repeat(signature.length)}`), null);
    assert.equal(readAttributionRef('not-a-token'), null);
});

test('a ref expires', () => {
    const issued = Date.parse('2026-01-01T00:00:00.000Z');
    const ref = mintAttributionRef({ campaignId: 'camp_1', channel: 'x' }, issued);
    assert.ok(ref);
    assert.ok(readAttributionRef(ref, issued + 60_000), 'fresh');
    assert.equal(
        readAttributionRef(ref, issued + 200 * 24 * 60 * 60 * 1000),
        null,
        'a share is news for a while, not forever'
    );
});

test('a link with no signing key goes out bare rather than forgeable', () => {
    const bare = withAttribution(
        'https://theblackout.test/v1/c/slug/camp_1',
        { campaignId: 'camp_1', channel: 'x' },
        Date.now(),
        {} as NodeJS.ProcessEnv
    );
    assert.equal(bare, 'https://theblackout.test/v1/c/slug/camp_1');
});

// --- the share surfaces ----------------------------------------------------

test('every share target gets its own link, so channels are distinguishable', async () => {
    const { coalition, campaign } = await setup();
    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`, {
        headers: auth(LEAD),
    });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const body = JSON.parse(text) as {
        targets: Array<{ target: string; href?: string }>;
    };

    const withHref = body.targets.filter((t) => t.href);
    assert.ok(withHref.length > 1);

    const channels = new Set<string>();
    for (const target of withHref) {
        const match = /ref%3D([^&%]+)|ref=([^&]+)/.exec(String(target.href));
        assert.ok(match, `no ref on ${target.target}`);
        const raw = decodeURIComponent(decodeURIComponent(match[1] ?? match[2] ?? ''));
        const claim = readAttributionRef(raw);
        assert.ok(claim, `unreadable ref on ${target.target}`);
        assert.equal(claim.campaignId, campaign.id);
        assert.equal(claim.sharerUserId, LEAD, 'credited to whoever shared');
        channels.add(claim.channel);
    }
    assert.ok(channels.size > 1, 'a Mastodon click is distinguishable from a copied link');
});

// --- the funnel ------------------------------------------------------------

test('a visit through the preview is counted, and the ref carries on to the app', async () => {
    const { coalition, campaign } = await setup();
    const ref = mintAttributionRef({
        campaignId: campaign.id,
        channel: 'mastodon',
        sharerUserId: LEAD,
    });
    assert.ok(ref);

    const res = await app.request(
        `/c/${coalition.slug}/${campaign.id}?ref=${encodeURIComponent(ref)}`
    );
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Coats for winter/, 'the card names the campaign');
    assert.match(html, /ref=/, 'and the destination keeps the token');

    const totals = campaignAttributionTotals(campaign.id);
    assert.equal(totals.totals.visits, 1);
    assert.equal(totals.byChannel[0]?.channel, 'mastodon');
});

test('joining with a ref credits the share that brought them', async () => {
    const { coalition, campaign } = await setup();
    const ref = mintAttributionRef({
        campaignId: campaign.id,
        channel: 'bluesky',
        sharerUserId: LEAD,
    });

    const joined = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(VISITOR),
        body: JSON.stringify({ ref }),
    });
    assert.equal(joined.status, 200, await joined.text());

    const totals = campaignAttributionTotals(campaign.id);
    assert.equal(totals.totals.joins, 1);
    assert.equal(totals.totals.visits, 0, 'a join is not also a visit');
});

test('a forged ref changes nothing and never fails the action', async () => {
    const { coalition, campaign } = await setup();
    const joined = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(VISITOR),
        body: JSON.stringify({ ref: 'garbage.signature' }),
    });
    assert.equal(joined.status, 200, 'the join still works');
    assert.equal(campaignAttributionTotals(campaign.id).totals.joins, 0);
});

test('the totals API serves counts per channel and never a list of people', async () => {
    const { coalition, campaign } = await setup();
    for (const channel of ['mastodon', 'mastodon', 'bluesky'] as const) {
        const ref = mintAttributionRef({ campaignId: campaign.id, channel, sharerUserId: LEAD });
        assert.ok(ref);
        await app.request(`/c/${coalition.slug}/${campaign.id}?ref=${encodeURIComponent(ref)}`);
    }

    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/attribution`,
        { headers: auth(LEAD) }
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        totals: { visits: number };
        byChannel: Array<{ channel: string; visits: number }>;
    };

    assert.equal(body.totals.visits, 3);
    const mastodon = body.byChannel.find((row) => row.channel === 'mastodon');
    assert.equal(mastodon?.visits, 2);

    // Nothing in the response identifies a visitor. A dashboard naming who
    // arrived from whose post would export their associations.
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /userId|ip|visitor|email/i);
});

test('the visitor leaves nothing behind: no per-visitor row exists to leave', async () => {
    const { coalition, campaign } = await setup();
    const ref = mintAttributionRef({ campaignId: campaign.id, channel: 'mastodon' });
    assert.ok(ref);
    await app.request(`/c/${coalition.slug}/${campaign.id}?ref=${encodeURIComponent(ref)}`);

    const rows = db.listCampaignAttribution({ campaignId: campaign.id });
    assert.equal(rows.length, 1, 'one row per share, not one per visitor');
    // Whatever a row holds, it cannot be a person who clicked.
    assert.deepEqual(
        Object.keys(rows[0]).filter((key) => /ip|agent|visitor|fingerprint|cookie/i.test(key)),
        []
    );
});
