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
process.env.BLACKOUT_PUBLIC_BASE_URL = 'https://blackout.test';
// Deliberately left OFF. Sharing must work without it: the crosspost gate holds
// back automation posting under a coalition's credentials, and a share link
// carries no credential.
delete process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { upsertProfile } = await import('../src/services/profileStore');

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

const LEAD = 'share-lead';
const QUIET = 'share-quiet';
for (const id of [LEAD, QUIET]) ensureUser(id);

interface Founded {
    id: string;
    slug: string;
}

async function found(name: string): Promise<Founded> {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Share widely' }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { coalition: Founded }).coalition;
}

async function launch(
    coalitionId: string,
    title: string,
    extra: Record<string, unknown> = {}
): Promise<{ id: string }> {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title, goalCents: 50_000, ...extra }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { campaign: { id: string } }).campaign;
}

/** A plain member's campaign starts pending_approval; the founder clears it. */
async function approve(coalitionId: string, campaignId: string): Promise<void> {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/approve`, {
        method: 'POST',
        headers: auth(LEAD),
    });
    assert.equal(res.status, 200, await res.text());
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    db.resetMemberProfilesForTest?.();
});

test('a logged-out stranger can share a campaign, with the gate off and no connection', async () => {
    const coalition = await found('Open Door');
    const campaign = await launch(coalition.id, 'Winter coats');

    // No authorization header at all.
    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`);
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const body = JSON.parse(text) as {
        url: string;
        text: string;
        targets: Array<{ target: string; label: string; href?: string }>;
    };

    // Requiring a steward-registered connection row, an opt-in, or
    // `campaigns.promote` would mean nobody outside the coalition could pass a
    // campaign on — which is the whole growth surface.
    assert.ok(body.targets.length > 5, 'every target we know how to reach');
    const byTarget = new Map(body.targets.map((t) => [t.target, t]));
    assert.match(byTarget.get('x')?.href ?? '', /^https:\/\/x\.com\/intent\/post\?text=/);
    assert.match(
        byTarget.get('facebook')?.href ?? '',
        /^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/
    );
    assert.match(byTarget.get('email')?.href ?? '', /^mailto:\?subject=/);
    assert.match(byTarget.get('whatsapp')?.href ?? '', /^https:\/\/wa\.me\/\?text=/);
});

test('every share carries a link back to Blackout, on every single target', async () => {
    const coalition = await found('Always Home');
    const campaign = await launch(coalition.id, 'Bus fares');
    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`);
    const body = (await res.json()) as {
        url: string;
        text: string;
        targets: Array<{ target: string; href?: string }>;
    };

    assert.equal(body.url, `https://blackout.test/v1/c/${coalition.slug}/${campaign.id}`);
    assert.ok(body.text.includes(body.url), 'the copy always ends with the link');
    for (const target of body.targets) {
        if (!target.href) continue;
        const encoded = decodeURIComponent(target.href);
        assert.ok(
            encoded.includes(body.url),
            `${target.target} must carry the Blackout URL, got ${target.href}`
        );
    }
});

test('targets with no reachable composer ask for the clipboard, not a dead link', async () => {
    const coalition = await found('Copy Path');
    const campaign = await launch(coalition.id, 'Flyers');
    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`);
    const body = (await res.json()) as {
        targets: Array<{ target: string; href?: string; needsInstanceHost?: boolean }>;
    };
    const byTarget = new Map(body.targets.map((t) => [t.target, t]));
    for (const target of ['copy', 'instagram', 'tiktok', 'discord']) {
        assert.equal(byTarget.get(target)?.href, undefined, `${target} has no web composer`);
    }
    // Mastodon's composer lives on the member's own instance; without one there
    // is nowhere correct to send them.
    assert.equal(byTarget.get('mastodon')?.href, undefined);
    assert.equal(byTarget.get('mastodon')?.needsInstanceHost, true);
});

test('a Mastodon instance host produces that instance composer, and junk is ignored', async () => {
    const coalition = await found('Fedi');
    const campaign = await launch(coalition.id, 'Mutual aid fund');
    const base = `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`;

    const good = (await (await app.request(`${base}?instanceHost=hachyderm.io`)).json()) as {
        targets: Array<{ target: string; href?: string }>;
    };
    assert.match(
        good.targets.find((t) => t.target === 'mastodon')?.href ?? '',
        /^https:\/\/hachyderm\.io\/share\?text=/
    );

    const bad = (await (
        await app.request(`${base}?instanceHost=${encodeURIComponent('evil.test/x?a=')}`)
    ).json()) as { targets: Array<{ target: string; href?: string }> };
    assert.equal(
        bad.targets.find((t) => t.target === 'mastodon')?.href,
        undefined,
        'a non-hostname must not be pasted into the share URL'
    );
});

test('a mutual-aid campaign for someone who opted out is not shareable off-platform', async () => {
    const coalition = await found('Quiet Aid');
    // QUIET raises for themselves, then opts out of public listing.
    const joined = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(QUIET),
    });
    assert.equal(joined.status, 200, await joined.text());
    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(QUIET),
        body: JSON.stringify({ type: 'mutual_aid', title: 'Rent this month', goalCents: 90_000 }),
    });
    const createdText = await created.text();
    assert.equal(created.status, 201, createdText);
    const campaign = (JSON.parse(createdText) as { campaign: { id: string; status: string } })
        .campaign;
    await approve(coalition.id, campaign.id);

    const before = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`
    );
    assert.equal(before.status, 200, 'shareable while they are publicly listed');

    upsertProfile(QUIET, { profile: { hideFromPublicRosters: true } });

    const after = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`
    );
    // 404, not 403: a distinguishable answer is an oracle for the very thing
    // they opted out of.
    assert.equal(after.status, 404, 'no share links for a private subject');
    assert.equal(((await after.json()) as { code: string }).code, 'not_found');
});

test('a drive is still shareable when its creator is private — it names nobody', async () => {
    const coalition = await found('Work Not People');
    const joined = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(QUIET),
    });
    assert.equal(joined.status, 200, await joined.text());
    upsertProfile(QUIET, { profile: { hideFromPublicRosters: true } });

    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(QUIET),
        body: JSON.stringify({ type: 'drive', title: 'Street cleanup', goalCents: 10_000 }),
    });
    const createdText = await created.text();
    assert.equal(created.status, 201, createdText);
    const campaign = (JSON.parse(createdText) as { campaign: { id: string } }).campaign;
    await approve(coalition.id, campaign.id);

    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`);
    const text = await res.text();
    assert.equal(res.status, 200, text);
    // The composed copy names the coalition and the campaign, never the member.
    assert.ok(!text.includes(QUIET), 'the private creator is never named in the copy');
});

test('a taken-down coalition stops promoting itself', async () => {
    const coalition = await found('Stopped');
    const campaign = await launch(coalition.id, 'Nope');
    const admin = 'share-admin';
    ensureUser(admin);
    process.env.BLACKOUT_ADMIN_USERS = admin;

    const down = await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(admin),
        body: JSON.stringify({ reason: 'policy' }),
    });
    assert.equal(down.status, 200, await down.text());
    delete process.env.BLACKOUT_ADMIN_USERS;

    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`);
    assert.equal(res.status, 404);
});

test('the preview route renders the campaign as an OpenGraph card, not the app shell', async () => {
    const coalition = await found('Unfurls');
    const campaign = await launch(coalition.id, 'Generators for the block');

    const res = await app.request(`/c/${coalition.slug}/${campaign.id}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<meta property="og:title" content="Unfurls: Generators for the block"/);
    assert.match(html, /\$0 raised of \$500\./);
    assert.match(
        html,
        new RegExp(
            `<meta property="og:url" content="https://blackout.test/v1/c/${coalition.slug}/${campaign.id}"`
        )
    );
    // Humans continue into the SPA campaign deep link.
    assert.match(
        html,
        new RegExp(`href="https://blackout.test/coalitions/${coalition.slug}/c/${campaign.id}"`)
    );
});

test('the preview answers 200 with a generic card for anything it cannot show', async () => {
    const coalition = await found('Generic');
    // Crawlers retry and cache failures; a 404 would poison the preview for a
    // link that works perfectly well for humans.
    for (const path of [`/c/${coalition.slug}/does-not-exist`, '/c/no-such-coalition/x']) {
        const res = await app.request(path);
        assert.equal(res.status, 200, path);
        assert.match(await res.text(), /Coalitions on Blackout/);
    }
});
