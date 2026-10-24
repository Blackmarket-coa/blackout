/**
 * Session capabilities and the `x-blackout-capabilities` header
 * (`src/modules/authz.ts`, `deriveUserCapabilities` in `src/services/auth.ts`).
 *
 * The header used to be added to the session token's capabilities, so any
 * signed-in account could grant itself any per-domain scope by naming it. It
 * can now only narrow what the caller holds. Session tokens carry a write
 * scope only where every route behind it checks ownership (or also requires
 * an admin); shared-state writes with no ownership or role check are for
 * allowlisted admins only, and `deadman.write` is held by nobody (N2).
 * Record: `docs/security/capability-header-triage-2026-10-23.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt, deriveUserCapabilities } = await import('../src/services/auth');
const { ADMIN_ONLY_SCOPES, CAPABILITY_DOMAINS } = await import('../src/modules/authz');
const { signJwtWithScopes } = await import('./_fixtures/capabilityToken');
const { db } = await import('../src/db/store');

const seedUser = () => {
    const id = randomUUID();
    const username = `caps-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username };
};

const withAdmins = async (usernames: string[], run: () => Promise<void>) => {
    const previous = process.env.BLACKOUT_ADMIN_USERS;
    process.env.BLACKOUT_ADMIN_USERS = usernames.join(',');
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.BLACKOUT_ADMIN_USERS;
        else process.env.BLACKOUT_ADMIN_USERS = previous;
    }
};

const send = (
    route: { method: string; path: string; body?: unknown },
    token: string,
    header?: string
) =>
    app.request(route.path, {
        method: route.method,
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            ...(header === undefined ? {} : { 'x-blackout-capabilities': header }),
        },
        body: route.body === undefined ? undefined : JSON.stringify(route.body),
    });

/** One write route per scope that no session token carries, and what it writes to. */
const UNMINTED_WRITES: Record<
    string,
    { method: string; path: string; body: unknown; rows: () => number }
> = {
    'governance.write': {
        method: 'POST',
        path: '/v1/governance/proposals',
        body: { communityId: 'caps-community', title: 'Self-granted proposal' },
        rows: () => db.votes.size,
    },
    'moderation.write': {
        method: 'POST',
        path: '/v1/moderation/actions',
        body: {
            communityId: 'caps-community',
            targetId: 'caps-target',
            action: 'ban',
            reason: 'self-granted',
        },
        rows: () => db.moderationActions.size,
    },
    'forum.write': {
        method: 'POST',
        path: '/v1/forum/posts',
        body: { communityId: 'caps-community', title: 'Self-granted', body: 'post' },
        rows: () => db.forumPosts.size,
    },
    'channels.write': {
        method: 'POST',
        path: '/v1/channels',
        body: { communityId: 'caps-community', name: 'self-granted' },
        rows: () => db.channels.size,
    },
    'growth.write': {
        method: 'POST',
        path: '/v1/growth/migration-credits',
        body: { sourceKind: 'campaign', valueCents: 100000 },
        rows: () => db.migrationCredits.size,
    },
    'deaddrop.write': {
        method: 'POST',
        path: '/v1/deaddrop',
        body: { channelId: 'caps-channel', recipientId: 'caps-recipient', payload: 'sealed' },
        rows: () => db.deadDrops.size,
    },
    'deadman.write': {
        method: 'POST',
        path: '/v1/deadman/switches',
        body: {
            roomId: '!caps-room:example.org',
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 600,
            recipients: ['@witness:example.org'],
            encryptedPayload: 'sealed-payload',
        },
        rows: () => db.deadmanSwitches.size,
    },
};

const unmintedWriteScopes = () =>
    CAPABILITY_DOMAINS.map((domain) => `${domain}.write`).filter(
        (scope) => !deriveUserCapabilities().includes(scope)
    );

test('H-1: session tokens carry write scopes only for the owner-checked domains', () => {
    const minted = deriveUserCapabilities();
    assert.deepEqual(minted.filter((cap) => cap.endsWith('.write')).sort(), [
        'discovery.write',
        'profile.write',
        'stego.write',
        'streaming.write',
    ]);
    assert.ok(!minted.some((cap) => cap === 'admin.*' || cap.startsWith('*')));
    for (const scope of ADMIN_ONLY_SCOPES) {
        assert.ok(!minted.includes(scope), `${scope} must not be minted`);
    }
    // Every unminted write scope is covered by the tests below.
    assert.deepEqual(unmintedWriteScopes().sort(), Object.keys(UNMINTED_WRITES).sort());
});

test('H-2: a default token naming an unminted write scope in the header gets 403 and writes nothing', async () => {
    const user = seedUser();
    const token = signJwt(user.id, user.username, 600);
    for (const [scope, route] of Object.entries(UNMINTED_WRITES)) {
        const domain = scope.split('.')[0];
        for (const header of [scope, `${domain}.*`, 'admin.*', '*', `${scope},admin.*,*`]) {
            const before = route.rows();
            const res = await send(route, token, header);
            assert.equal(res.status, 403, `${scope} via header "${header}"`);
            assert.equal(((await res.json()) as { code: string }).code, 'missing_capability');
            assert.equal(route.rows(), before, `${scope} via header "${header}" wrote a row`);
        }
    }
});

test('H-3: the same routes accept a token whose claims carry the scope (the test reaches them)', async () => {
    const user = seedUser();
    for (const [scope, route] of Object.entries(UNMINTED_WRITES)) {
        const before = route.rows();
        const res = await send(route, signJwtWithScopes(user.id, user.username, [scope]));
        assert.equal(res.status, 201, `${scope} from claims`);
        assert.equal(route.rows(), before + 1);
    }
});

test('H-4: an allowlisted admin holds the admin-only scopes, but not deadman.write', async () => {
    const admin = seedUser();
    const token = signJwt(admin.id, admin.username, 600);
    await withAdmins([admin.username], async () => {
        for (const [scope, route] of Object.entries(UNMINTED_WRITES)) {
            const res = await send(route, token);
            if (scope === 'deadman.write') {
                assert.equal(res.status, 403, 'an admin cannot arm a dead-man switch (N2)');
            } else {
                assert.equal(res.status, 201, `${scope} for an allowlisted admin`);
            }
        }
        const channels = await send({ method: 'GET', path: '/v1/channels' }, token);
        assert.equal(channels.status, 200, 'channels.read is admin-only, and the admin holds it');

        // The header narrows an admin's scopes like anyone else's.
        const narrowed = await send(UNMINTED_WRITES['governance.write'], token, 'governance.read');
        assert.equal(narrowed.status, 403);
    });

    // Off the allowlist, the same account is refused again.
    const after = await send(UNMINTED_WRITES['governance.write'], token);
    assert.equal(after.status, 403);
});

test('H-5: a header that leaves a held scope out removes it for that request', async () => {
    const user = seedUser();
    const token = signJwt(user.id, user.username, 600);
    const saveProfile = {
        method: 'PUT',
        path: `/v1/profile/${user.id}`,
        body: { displayName: 'Narrowed' },
    };

    assert.equal((await send(saveProfile, token, 'profile.read')).status, 403);
    assert.equal((await send(saveProfile, token, 'streaming.write')).status, 403);
    assert.equal((await send(saveProfile, token)).status, 200);
    assert.equal((await send(saveProfile, token, 'profile.read,profile.write')).status, 200);
    assert.equal((await send(saveProfile, token, 'profile.*')).status, 200);

    // A scope held through the claims is narrowed the same way.
    const claimed = signJwtWithScopes(user.id, user.username, ['governance.write']);
    const propose = UNMINTED_WRITES['governance.write'];
    assert.equal((await send(propose, claimed, 'governance.read')).status, 403);
    assert.equal((await send(propose, claimed, 'governance.write')).status, 201);
});

test('H-6: admin.* named in the header grants nothing an admin.* claim would', async () => {
    const user = seedUser();
    const token = signJwt(user.id, user.username, 600);
    const res = await send(UNMINTED_WRITES['governance.write'], token, 'admin.*');
    assert.equal(res.status, 403);

    // The same scope minted into the claims is the superuser grant.
    const superuser = signJwtWithScopes(user.id, user.username, ['admin.*']);
    assert.equal((await send(UNMINTED_WRITES['governance.write'], superuser)).status, 201);
});

test('H-7: discovery index writes other than canopy listing are for allowlisted admins only', async () => {
    const user = seedUser();
    const token = signJwt(user.id, user.username, 600);
    const entityId = `caps-entity-${randomUUID().slice(0, 8)}`;
    const indexWrites = [
        {
            method: 'POST',
            path: '/v1/discovery/index/profiles',
            body: { id: entityId, entityType: 'canopy', name: 'Self-indexed' },
        },
        { method: 'POST', path: '/v1/discovery/index/activity', body: { id: entityId } },
        { method: 'POST', path: '/v1/discovery/index/jobs/full' },
        { method: 'POST', path: '/v1/discovery/index/jobs/incremental' },
        {
            method: 'POST',
            path: '/v1/discovery/analytics/events',
            body: { entityId, stage: 'click' },
        },
    ];

    for (const route of indexWrites) {
        const res = await send(route, token);
        assert.equal(res.status, 403, route.path);
        assert.equal(((await res.json()) as { code: string }).code, 'forbidden');
    }
    const search = await send(
        { method: 'GET', path: `/v1/discovery/browse/search?q=${entityId}` },
        token
    );
    assert.equal(search.status, 200);
    assert.ok(!JSON.stringify(await search.json()).includes(entityId), 'nothing was indexed');

    await withAdmins([user.username], async () => {
        const indexed = await send(indexWrites[0], token);
        assert.equal(indexed.status, 202);
        const job = await send(indexWrites[2], token);
        assert.equal(job.status, 200);
    });
});
