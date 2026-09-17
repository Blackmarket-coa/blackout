/**
 * Safety gates on the credentialed cross-post path, and credential custody.
 *
 * These pin four defects that were live:
 *
 *  1. `crosspostCampaign` never consulted `campaignIsPubliclyShareable`. That
 *     gate exists to stop a mutual-aid campaign naming someone who kept their
 *     profile unlisted from being broadcast. `shareCampaign` checked it and the
 *     OG card checked it; the credentialed, higher-volume path did not — so a
 *     person who had opted out of being listed was protected from a menu click
 *     and not from an API post.
 *  2. `crosspostCampaign` never consulted `isStopped`, so an archived coalition
 *     — or one the platform had taken down — kept broadcasting under its own
 *     name.
 *  3. Nothing in the repo could revoke a stored platform credential. A leaked
 *     coalition bot token needed a direct database write.
 *  4. A member who left kept a live row holding their own platform token, and
 *     nothing could clear it.
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
process.env.COALITION_CROSSPOST_COOLDOWN_MINUTES = '0';
process.env.COALITION_CROSSPOST_DAILY_CAP = '5';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests, takeDownCoalition } = await import(
    '../src/services/coalitionNetworkStore'
);
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { __setPlatformPosterForTests } = await import('../src/services/coalitionSync');

const { SECRET_KEY_RE } = await import('@blackout/core');

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

/**
 * Flip the opt-out `isPubliclyListed` reads. Written through the profile store
 * rather than a service helper because the flag lives on the profile blob and
 * there is no setter for it alone.
 */
function setListed(userId: string, listed: boolean): void {
    const existing = db.getMemberProfile(userId);
    db.upsertMemberProfile({
        ...(existing ?? { userId, displayName: userId }),
        userId,
        profile: { hideFromPublicRosters: !listed },
    } as Parameters<typeof db.upsertMemberProfile>[0]);
}

const LEAD = 'xp-lead';
const GRIOT = 'xp-griot';
const SUBJECT = 'xp-subject';
for (const id of [LEAD, GRIOT, SUBJECT]) ensureUser(id);

async function setup(campaignBody: Record<string, unknown>) {
    const created = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Safety', mission: 'Hold the line' }),
    });
    const { coalition } = (await created.json()) as { coalition: { id: string } };
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(GRIOT),
    });
    await app.request(`/v1/coalitions/${coalition.id}/members/${GRIOT}`, {
        method: 'PATCH',
        headers: auth(LEAD),
        body: JSON.stringify({ role: 'griot' }),
    });
    const campaignRes = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ title: 'Coats for winter', goalCents: 100_000, ...campaignBody }),
    });
    const text = await campaignRes.text();
    assert.equal(campaignRes.status, 201, text);
    const { campaign } = JSON.parse(text) as { campaign: { id: string } };

    // `beneficiaryUserId` is deliberately not accepted on the create route —
    // it decides who gets the money — so it is written here the way the
    // server writes it, rather than pretending a client could send it.
    if (campaignBody.beneficiaryUserId) {
        const stored = db.getCoalitionCampaign(campaign.id);
        assert.ok(stored, 'campaign was persisted');
        db.upsertCoalitionCampaign({
            ...stored,
            beneficiaryUserId: String(campaignBody.beneficiaryUserId),
        });
    }

    await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            platform: 'bluesky',
            authMode: 'shared',
            secret: 'bot-token',
            displayHandle: '@safety',
        }),
    });
    await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/sync`, {
        method: 'POST',
        headers: auth(GRIOT),
        body: JSON.stringify({ platform: 'bluesky', enabled: true }),
    });
    return { coalition, campaign };
}

const crosspost = (coalitionId: string, campaignId: string) =>
    app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/crosspost`, {
        method: 'POST',
        headers: auth(GRIOT),
    });

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setPlatformPosterForTests(null);
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
    setListed(SUBJECT, true);
});

// --- the privacy gate ------------------------------------------------------

test('an unlisted mutual-aid subject is not broadcast by the credentialed path', async () => {
    let posted = 0;
    __setPlatformPosterForTests(async () => {
        posted += 1;
        return { ok: true, externalId: 'x1' };
    });

    const { coalition, campaign } = await setup({
        type: 'mutual_aid',
        beneficiaryUserId: SUBJECT,
    });

    // Opted in while listed: the post goes out.
    const listed = await crosspost(coalition.id, campaign.id);
    assert.equal(listed.status, 200, await listed.text());
    assert.equal(posted, 1);

    // The subject opts out of being listed. The menu-click share already
    // honoured this; the API post did not.
    setListed(SUBJECT, false);
    const unlisted = await crosspost(coalition.id, campaign.id);
    // 404 rather than 403 by design: a distinguishable "exists but private"
    // answer is an oracle for the very thing the subject opted out of.
    assert.equal(unlisted.status, 404, await unlisted.text());
    assert.equal(posted, 1, 'nothing left the building');

    const share = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/share`
    );
    assert.equal(share.status, 404, 'and the two surfaces now agree');
});

// --- the stopped gate ------------------------------------------------------

test('a taken-down coalition stops broadcasting', async () => {
    let posted = 0;
    __setPlatformPosterForTests(async () => {
        posted += 1;
        return { ok: true, externalId: 'x1' };
    });
    const { coalition, campaign } = await setup({ type: 'drive' });
    assert.equal((await crosspost(coalition.id, campaign.id)).status, 200);
    assert.equal(posted, 1);

    const stopped = await takeDownCoalition(coalition.id, 'moderator', 'policy');
    assert.equal(stopped.ok, true);

    const after = await crosspost(coalition.id, campaign.id);
    assert.equal(after.status, 404, await after.text());
    assert.equal(posted, 1, 'the subject of a takedown does not keep posting');
});

// --- revocation ------------------------------------------------------------

test('disconnecting a platform destroys the credential rather than orphaning it', async () => {
    const { coalition } = await setup({ type: 'drive' });

    const stored = db.getCoalitionConnection(coalition.id, 'bluesky');
    assert.ok(stored?.credentialRef, 'a shared secret was stored to begin with');

    const res = await app.request(`/v1/coalitions/${coalition.id}/connections/bluesky`, {
        method: 'DELETE',
        headers: auth(LEAD),
    });
    assert.equal(res.status, 200, await res.text());

    const after = db.getCoalitionConnection(coalition.id, 'bluesky');
    assert.equal(after?.active, false, 'deactivated');
    assert.equal(after?.credentialRef, undefined, 'and the ciphertext is gone, not just unused');

    const listed = (await (
        await app.request(`/v1/coalitions/${coalition.id}/connections`, { headers: auth(LEAD) })
    ).json()) as { connections: Array<{ platform: string }> };
    assert.equal(
        listed.connections.some((row) => row.platform === 'bluesky'),
        false
    );
});

test('a member who is not a connections manager cannot disconnect', async () => {
    const { coalition } = await setup({ type: 'drive' });
    const res = await app.request(`/v1/coalitions/${coalition.id}/connections/bluesky`, {
        method: 'DELETE',
        headers: auth(GRIOT),
    });
    assert.equal(res.status, 403, await res.text());
    assert.ok(db.getCoalitionConnection(coalition.id, 'bluesky')?.credentialRef);
});

test('leaving a coalition ends its custody of your personal token', async () => {
    const { coalition } = await setup({ type: 'drive' });

    // Switch the platform to personal and have the griot link their own account.
    await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ platform: 'bluesky', authMode: 'personal' }),
    });
    const linked = await app.request(`/v1/coalitions/${coalition.id}/connections/me`, {
        method: 'POST',
        headers: auth(GRIOT),
        body: JSON.stringify({ platform: 'bluesky', secret: 'my-own-token' }),
    });
    assert.equal(linked.status, 201, await linked.text());

    const before = db
        .listCoalitionMemberConnections({ coalitionId: coalition.id, userId: GRIOT })
        .find((row) => row.platform === 'bluesky');
    assert.ok(before?.credentialRef, 'the member token is at rest');

    const left = await app.request(`/v1/coalitions/${coalition.id}/leave`, {
        method: 'POST',
        headers: auth(GRIOT),
    });
    assert.equal(left.status, 200, await left.text());

    const after = db
        .listCoalitionMemberConnections({ coalitionId: coalition.id, userId: GRIOT })
        .find((row) => row.platform === 'bluesky');
    assert.ok(after?.revokedAt, 'revoked');
    assert.equal(after?.credentialRef, undefined, 'and the secret is gone with them');
});

test('changing the auth mode does not silently retain the old credential', async () => {
    const { coalition } = await setup({ type: 'drive' });
    assert.ok(db.getCoalitionConnection(coalition.id, 'bluesky')?.credentialRef);

    await app.request(`/v1/coalitions/${coalition.id}/connections`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ platform: 'bluesky', authMode: 'personal' }),
    });

    const after = db.getCoalitionConnection(coalition.id, 'bluesky');
    assert.equal(after?.authMode, 'personal');
    assert.equal(
        after?.credentialRef,
        undefined,
        'a steward who switched away from the shared account is not still holding its token'
    );
});

// --- logging ---------------------------------------------------------------

test('the log redactor covers this feature own credential field name', () => {
    // `secret` alone did not match `credentialRef`, which is what this feature
    // calls the value everywhere — so the most natural debug line an adapter
    // author writes passed through unredacted.
    assert.equal(SECRET_KEY_RE.test('credentialRef'), true);
    assert.equal(SECRET_KEY_RE.test('credential_ref'), true);
    assert.equal(SECRET_KEY_RE.test('credential'), true);
});
