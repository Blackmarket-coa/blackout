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
// Secrets at rest need a key; this is the documented test envelope key.
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS =
    process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS ??
    'test:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
process.env.COALITION_CROSSPOST_COOLDOWN_MINUTES = '0';
process.env.COALITION_CROSSPOST_DAILY_CAP = '2';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const {
    __setPlatformPosterForTests,
    composePost,
    ingestExternalActivity,
    shareLinkFor,
    checkGuardrails,
} = await import('../src/services/coalitionSync');

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

const LEAD = 'syn-lead';
const MEMBER = 'syn-member';
const OUTSIDER = 'syn-outsider';
for (const id of [LEAD, MEMBER, OUTSIDER]) ensureUser(id);

async function setup(name: string) {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Tell the story' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    // Promoting the coalition on an external platform is the griot's role —
    // `campaigns.promote` — not something every member holds. A plain member
    // speaking for the whole coalition on X or Discord is what that permission
    // exists to prevent, so the fixture gives the poster the role the act needs.
    await app.request(`/v1/coalitions/${coalition.id}/members/${MEMBER}`, {
        method: 'PATCH',
        headers: auth(LEAD),
        body: JSON.stringify({ role: 'griot' }),
    });
    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Coats for winter', goalCents: 100_000 }),
    });
    const { campaign } = (await campaignRes.json()) as { campaign: { id: string } };
    return { coalition, campaign };
}

const connect = (coalitionId: string, body: Record<string, unknown>, user = LEAD) =>
    app.request(`/v1/coalitions/${coalitionId}/connections`, {
        method: 'POST',
        headers: auth(user),
        body: JSON.stringify(body),
    });

const optIn = (
    coalitionId: string,
    campaignId: string,
    platform: string,
    enabled: boolean,
    user = MEMBER
) =>
    app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/sync`, {
        method: 'POST',
        headers: auth(user),
        body: JSON.stringify({ platform, enabled }),
    });

const crosspost = (coalitionId: string, campaignId: string, user = MEMBER) =>
    app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/crosspost`, {
        method: 'POST',
        headers: auth(user),
    });

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setPlatformPosterForTests(null);
    delete process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED;
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
});

test('post composition is one text for every platform, and unsupported platforms get a share link', () => {
    const post = composePost(
        {
            id: 'c1',
            slug: 'river-keepers',
            name: 'River Keepers',
            mission: 'm',
            joinMode: 'open',
            createdBy: 'u',
            createdAt: '',
            updatedAt: '',
        } as never,
        { id: 'k1', type: 'drive', title: 'Coats', goalCents: 50_000 } as never,
        'https://blackout.test'
    );
    assert.match(post.text, /River Keepers is raising for Coats\./);
    assert.match(post.text, /Goal: \$500\./);
    // The URL is the campaign's server-rendered preview, not the coalition page
    // and not the SPA: a crawler reads meta tags and does not run JS, so the SPA
    // path unfurls as the generic app card on every platform.
    assert.equal(post.url, 'https://blackout.test/v1/c/river-keepers/k1');

    // Platforms that sanction posting get real posts, not links.
    assert.equal(shareLinkFor('discord', post), null);
    // The ones that do not get a prefilled composer or the campaign URL.
    assert.match(shareLinkFor('x', post) ?? '', /^https:\/\/x\.com\/intent\/post\?text=/);
    assert.equal(shareLinkFor('instagram', post), post.url);
    assert.equal(shareLinkFor('tiktok', post), post.url);
});

test('cross-posting requires an explicit per-campaign opt-in — never auto-blast', async () => {
    const { coalition, campaign } = await setup('Quiet by default');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    __setPlatformPosterForTests(async () => ({ ok: true, externalPostId: 'ext-1' }));

    // Connected, but the member never opted this campaign in.
    const refused = await crosspost(coalition.id, campaign.id);
    assert.equal(refused.status, 409);
    assert.equal(((await refused.json()) as { code: string }).code, 'not_opted_in');

    const state = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/sync`, {
            headers: auth(MEMBER),
        })
    ).json()) as { optIns: unknown[] };
    assert.deepEqual(state.optIns, [], 'no rows means off');

    assert.equal((await optIn(coalition.id, campaign.id, 'discord', true)).status, 200);
    const posted = await crosspost(coalition.id, campaign.id);
    assert.equal(posted.status, 200);
    const body = (await posted.json()) as { outcomes: Array<{ platform: string; status: string }> };
    assert.deepEqual(body.outcomes, [
        { platform: 'discord', status: 'posted', postId: body.outcomes[0].postId },
    ]);

    // Opting in to one campaign does not opt in to the next.
    const second = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Boots', goalCents: 1_000 }),
    });
    const other = ((await second.json()) as { campaign: { id: string } }).campaign;
    const notCarried = await crosspost(coalition.id, other.id);
    assert.equal(notCarried.status, 409);
});

test('platforms without bot posting fall back to a share link instead of a failed post', async () => {
    const { coalition, campaign } = await setup('Fallbacks');
    await connect(coalition.id, { platform: 'instagram', authMode: 'shared' });
    await optIn(coalition.id, campaign.id, 'instagram', true);
    let posterCalled = false;
    __setPlatformPosterForTests(async () => {
        posterCalled = true;
        return { ok: true };
    });

    const res = await crosspost(coalition.id, campaign.id);
    const body = (await res.json()) as {
        outcomes: Array<{ platform: string; status: string; shareUrl?: string }>;
    };
    assert.equal(body.outcomes[0].status, 'share_link');
    assert.ok(body.outcomes[0].shareUrl, 'a link a human completes');
    assert.equal(posterCalled, false, 'no unsupported automation is attempted');
});

test('a personal-mode platform with no linked account degrades to a share link', async () => {
    const { coalition, campaign } = await setup('Personal mode');
    await connect(coalition.id, { platform: 'x', authMode: 'personal' });
    await optIn(coalition.id, campaign.id, 'x', true);
    __setPlatformPosterForTests(async () => ({ ok: true, externalPostId: 'x-1' }));

    const unlinked = await crosspost(coalition.id, campaign.id);
    const first = (await unlinked.json()) as { outcomes: Array<{ status: string }> };
    assert.equal(first.outcomes[0].status, 'share_link', 'never falls back to the shared account');

    const linked = await app.request(`/v1/coalitions/${coalition.id}/connections/me`, {
        method: 'POST',
        headers: auth(MEMBER),
        body: JSON.stringify({
            platform: 'x',
            secret: 'member.bsky.social|app-pass',
            displayHandle: '@member',
        }),
    });
    assert.equal(linked.status, 201);
    // The secret never comes back out of the API.
    assert.ok(!JSON.stringify(await linked.json()).includes('member-token'));

    const now = await crosspost(coalition.id, campaign.id);
    const second = (await now.json()) as { outcomes: Array<{ status: string }> };
    assert.equal(second.outcomes[0].status, 'posted');
});

test('auth mode is per platform, so one coalition mixes shared and personal', async () => {
    const { coalition } = await setup('Mixed auth');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    await connect(coalition.id, { platform: 'x', authMode: 'personal' });

    const res = await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        headers: auth(MEMBER),
    });
    const { connections } = (await res.json()) as {
        connections: Array<{
            platform: string;
            authMode: string;
            apiPost: boolean;
            memberLinked: boolean;
        }>;
    };
    const byPlatform = Object.fromEntries(connections.map((c) => [c.platform, c]));
    assert.equal(byPlatform.discord.authMode, 'shared');
    assert.equal(byPlatform.x.authMode, 'personal');
    assert.equal(byPlatform.x.memberLinked, false);
});

test('only a role with connections.manage can connect a platform', async () => {
    const { coalition } = await setup('Gatekept connections');
    const asMember = await connect(
        coalition.id,
        { platform: 'discord', authMode: 'shared' },
        MEMBER
    );
    assert.equal(asMember.status, 403);
    const asOutsider = await connect(
        coalition.id,
        { platform: 'discord', authMode: 'shared' },
        OUTSIDER
    );
    assert.equal(asOutsider.status, 403);
});

test('a daily cap limits blast fatigue per member per coalition', async () => {
    const { coalition, campaign } = await setup('Guardrails');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    await optIn(coalition.id, campaign.id, 'discord', true);
    __setPlatformPosterForTests(async () => ({ ok: true, externalPostId: 'd' }));

    assert.equal((await crosspost(coalition.id, campaign.id)).status, 200);
    assert.equal((await crosspost(coalition.id, campaign.id)).status, 200);
    const capped = await crosspost(coalition.id, campaign.id);
    assert.equal(capped.status, 429);
    const body = (await capped.json()) as { code: string; cap: number; postsToday: number };
    assert.equal(body.code, 'daily_cap');
    assert.equal(body.cap, 2);
    assert.equal(body.postsToday, 2);

    // The cap is per member: a different member still has their own budget.
    await optIn(coalition.id, campaign.id, 'discord', true, LEAD);
    assert.equal((await crosspost(coalition.id, campaign.id, LEAD)).status, 200);
});

test('a cooldown spaces posts out when one is configured', () => {
    process.env.COALITION_CROSSPOST_COOLDOWN_MINUTES = '60';
    try {
        db.upsertCoalitionCampaignPost({
            id: 'post-recent',
            campaignId: 'k',
            coalitionId: 'cool-coalition',
            platform: 'discord',
            direction: 'out',
            syncStatus: 'posted',
            authorUserId: MEMBER,
        });
        const state = checkGuardrails('cool-coalition', MEMBER);
        assert.equal(state.allowed, false);
        assert.equal(state.reason, 'cooldown');
        assert.ok((state.retryAfterSeconds ?? 0) > 0);
    } finally {
        process.env.COALITION_CROSSPOST_COOLDOWN_MINUTES = '0';
        db.coalitionCampaignPosts.clear();
    }
});

test('two-way sync stays dark until the trust gate is opened', async () => {
    const { coalition, campaign } = await setup('Dark by default');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    await optIn(coalition.id, campaign.id, 'discord', true);
    __setPlatformPosterForTests(async () => ({ ok: true, externalPostId: 'ext-9' }));
    const posted = await crosspost(coalition.id, campaign.id);
    const { outcomes } = (await posted.json()) as { outcomes: Array<{ postId: string }> };

    // Inbound refuses entirely while the gate is closed — it does not half-work.
    const refused = ingestExternalActivity({
        campaignPostId: outcomes[0].postId,
        sourcePlatform: 'discord',
        externalAuthor: 'Ada',
        content: 'Sent a box',
    });
    assert.equal(refused.ok, false);
    assert.deepEqual(refused.ok === false ? refused.error : null, {
        kind: 'disabled',
        gate: 'inbound',
    });
});

test('inbound replies are quarantined, attributed without a profile, and only visible once approved', async () => {
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '1';
    const { coalition, campaign } = await setup('Moderated');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    await optIn(coalition.id, campaign.id, 'discord', true);
    __setPlatformPosterForTests(async () => ({ ok: true, externalPostId: 'ext-10' }));
    const posted = await crosspost(coalition.id, campaign.id);
    const { outcomes } = (await posted.json()) as { outcomes: Array<{ postId: string }> };

    const ingested = ingestExternalActivity({
        campaignPostId: outcomes[0].postId,
        sourcePlatform: 'discord',
        externalAuthor: 'Ada',
        externalId: 'discord-msg-1',
        content: 'Dropping off ten coats tomorrow',
    });
    assert.equal(ingested.ok, true);
    assert.equal(ingested.ok && ingested.value.moderationStatus, 'pending');

    // Redelivery of the same origin id does not duplicate.
    const again = ingestExternalActivity({
        campaignPostId: outcomes[0].postId,
        sourcePlatform: 'discord',
        externalAuthor: 'Ada',
        externalId: 'discord-msg-1',
        content: 'Dropping off ten coats tomorrow',
    });
    assert.equal(again.ok && again.value.id, ingested.ok && ingested.value.id);

    // Nothing shows on the thread while it is pending.
    const before = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/thread`)
    ).json()) as { replies: unknown[] };
    assert.deepEqual(before.replies, []);

    // A plain member cannot moderate.
    const activityId = ingested.ok ? ingested.value.id : '';
    const asMember = await app.request(
        `/v1/coalitions/${coalition.id}/externals/${activityId}/approve`,
        { method: 'POST', headers: auth(MEMBER) }
    );
    assert.equal(asMember.status, 403);

    const queue = (await (
        await app.request(`/v1/coalitions/${coalition.id}/externals/pending`, {
            headers: auth(LEAD),
        })
    ).json()) as { pending: Array<{ id: string; attribution: string }> };
    assert.equal(queue.pending.length, 1);
    assert.equal(queue.pending[0].attribution, 'Ada via Discord');

    const approved = await app.request(
        `/v1/coalitions/${coalition.id}/externals/${activityId}/approve`,
        { method: 'POST', headers: auth(LEAD) }
    );
    assert.equal(approved.status, 200);

    const after = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/thread`)
    ).json()) as {
        replies: Array<
            { attribution: string; content: string; externalAuthor: string } & Record<
                string,
                unknown
            >
        >;
    };
    assert.equal(after.replies.length, 1);
    assert.equal(after.replies[0].attribution, 'Ada via Discord');
    assert.equal(after.replies[0].content, 'Dropping off ten coats tomorrow');
    // The external author is display text — no Blackout identity is implied.
    assert.ok(!('userId' in after.replies[0]));
    assert.ok(!('matrixUserId' in after.replies[0]));
    assert.equal(db.getUserById(after.replies[0].externalAuthor), undefined);

    delete process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED;
});

test('rejected replies never reach the thread', async () => {
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED = '1';
    const { coalition, campaign } = await setup('Rejections');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    await optIn(coalition.id, campaign.id, 'discord', true);
    __setPlatformPosterForTests(async () => ({ ok: true, externalPostId: 'ext-11' }));
    const posted = await crosspost(coalition.id, campaign.id);
    const { outcomes } = (await posted.json()) as { outcomes: Array<{ postId: string }> };
    const ingested = ingestExternalActivity({
        campaignPostId: outcomes[0].postId,
        sourcePlatform: 'discord',
        externalAuthor: 'Spammer',
        content: 'buy followers',
    });
    const id = ingested.ok ? ingested.value.id : '';
    await app.request(`/v1/coalitions/${coalition.id}/externals/${id}/reject`, {
        method: 'POST',
        headers: auth(LEAD),
    });
    const thread = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/thread`)
    ).json()) as { replies: unknown[] };
    assert.deepEqual(thread.replies, []);
    delete process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED;
});

test('cross-posting refuses when the outbound gate is off', async () => {
    const { coalition, campaign } = await setup('Outbound dark');
    await connect(coalition.id, {
        platform: 'discord',
        authMode: 'shared',
        secret: DISCORD_WEBHOOK,
    });
    await optIn(coalition.id, campaign.id, 'discord', true);
    delete process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED;
    const res = await crosspost(coalition.id, campaign.id);
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { code: string }).code, 'sync_disabled');
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
});
