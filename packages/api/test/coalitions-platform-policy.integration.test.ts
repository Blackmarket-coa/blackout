/**
 * The per-platform policy record behind cross-posting.
 *
 * `COALITION_PLATFORM_CAPABILITIES` used to say `apiPost: true` for X with
 * nothing recording that posting there needs a paid developer agreement nobody
 * has signed. `COALITION_PLATFORM_POLICY` now records, for every platform,
 * which terms the adapter operates under, what that access costs, what limit
 * it must respect and who accepted what. What is pinned here is that the
 * record is complete and honest, and that an unsigned agreement blocks
 * automation on its own — even if someone later flips `adapter: true` for X.
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
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { __setAdapterFetchForTests, postToPlatform } = await import(
    '../src/services/coalitionPlatformAdapters'
);
const {
    COALITION_PLATFORMS,
    COALITION_PLATFORM_CAPABILITIES,
    COALITION_PLATFORM_POLICY,
    platformAutomationBlockers,
    platformCanAutomate,
} = await import('@blackout/core');

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setAdapterFetchForTests(undefined);
});

// --- the record is complete --------------------------------------------------

test('every platform has a policy row, and only the declared platforms do', () => {
    for (const platform of COALITION_PLATFORMS) {
        assert.ok(COALITION_PLATFORM_POLICY[platform], `${platform} has no policy row`);
    }
    assert.deepEqual(
        Object.keys(COALITION_PLATFORM_POLICY).sort(),
        [...COALITION_PLATFORMS].sort(),
        'the policy table and the platform list name the same platforms'
    );
});

test('reviewedOn is a calendar date everywhere', () => {
    for (const platform of COALITION_PLATFORMS) {
        assert.match(
            COALITION_PLATFORM_POLICY[platform].reviewedOn,
            /^\d{4}-\d{2}-\d{2}$/,
            `${platform} reviewedOn`
        );
    }
});

test('every terms url is https or null, and null only for instance-specific terms', () => {
    for (const platform of COALITION_PLATFORMS) {
        const { terms } = COALITION_PLATFORM_POLICY[platform];
        assert.ok(terms.name.length > 0, `${platform} names its terms`);
        if (terms.url === null) {
            assert.equal(platform, 'mastodon', `${platform} may not omit a terms url`);
        } else {
            assert.match(terms.url, /^https:\/\//, `${platform} terms url`);
        }
    }
});

test('a cited rate limit is a positive number with a named source', () => {
    for (const platform of COALITION_PLATFORMS) {
        const { rateLimit } = COALITION_PLATFORM_POLICY[platform];
        if (rateLimit === null) continue;
        assert.ok(rateLimit.posts > 0, `${platform} posts`);
        assert.ok(rateLimit.perSeconds > 0, `${platform} perSeconds`);
        assert.ok(rateLimit.source.length > 0, `${platform} cites the document`);
    }
});

// --- the record is honest ----------------------------------------------------

test('an adapter is only ever built on terms this project has accepted', () => {
    // The invariant the whole record exists to enforce: adapter:true implies
    // the platform either needs no agreement or somebody has recorded one.
    for (const platform of COALITION_PLATFORMS) {
        const capability = COALITION_PLATFORM_CAPABILITIES[platform];
        const policy = COALITION_PLATFORM_POLICY[platform];
        if (!capability.adapter) continue;
        assert.ok(
            !policy.agreementRequired || policy.agreementAccepted !== null,
            `${platform} has an adapter but its agreement has not been accepted`
        );
    }
});

test('X needs a paid developer agreement and nobody has signed one', () => {
    const x = COALITION_PLATFORM_POLICY.x;
    assert.equal(x.automationBasis, 'developer_agreement');
    assert.equal(x.accessTier, 'paid');
    assert.equal(x.agreementRequired, true);
    assert.equal(x.agreementAccepted, null);
});

test('the platforms with adapters run on free, sanctioned credentials', () => {
    assert.equal(COALITION_PLATFORM_POLICY.discord.automationBasis, 'incoming_webhook');
    assert.equal(COALITION_PLATFORM_POLICY.bluesky.automationBasis, 'app_password');
    assert.equal(COALITION_PLATFORM_POLICY.mastodon.automationBasis, 'application_token');
    for (const platform of ['discord', 'bluesky', 'mastodon'] as const) {
        const policy = COALITION_PLATFORM_POLICY[platform];
        assert.equal(policy.accessTier, 'free', platform);
        assert.equal(policy.agreementRequired, false, platform);
        assert.notEqual(policy.rateLimit, null, `${platform} cites the limit it stays under`);
    }
});

test('platforms with no programmatic posting claim no basis and no limit', () => {
    for (const platform of ['instagram', 'tiktok'] as const) {
        const policy = COALITION_PLATFORM_POLICY[platform];
        assert.equal(policy.automationBasis, 'none', platform);
        assert.equal(policy.agreementRequired, false, platform);
        assert.equal(policy.rateLimit, null, platform);
    }
});

// --- the blockers ------------------------------------------------------------

test('blockers are listed in the order a steward should hear them', () => {
    assert.deepEqual(platformAutomationBlockers('x'), ['no_adapter', 'agreement_unsigned']);
    assert.deepEqual(platformAutomationBlockers('instagram'), ['share_link_only']);
    assert.deepEqual(platformAutomationBlockers('tiktok'), ['share_link_only']);
    assert.deepEqual(platformAutomationBlockers('discord'), []);
    assert.deepEqual(platformAutomationBlockers('bluesky'), []);
    assert.deepEqual(platformAutomationBlockers('mastodon'), []);
});

test('platformCanAutomate is unchanged for all six platforms', () => {
    assert.equal(platformCanAutomate('discord'), true);
    assert.equal(platformCanAutomate('bluesky'), true);
    assert.equal(platformCanAutomate('mastodon'), true);
    assert.equal(platformCanAutomate('x'), false);
    assert.equal(platformCanAutomate('instagram'), false);
    assert.equal(platformCanAutomate('tiktok'), false);
    for (const platform of COALITION_PLATFORMS) {
        assert.equal(
            platformCanAutomate(platform),
            platformAutomationBlockers(platform).length === 0,
            `${platform} automates exactly when nothing blocks it`
        );
    }
});

test('posting to X answers with the first blocker and never touches the network', async () => {
    let fetched = 0;
    __setAdapterFetchForTests((async () => {
        fetched += 1;
        return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);

    const result = await postToPlatform({
        platform: 'x',
        text: 'hello',
        url: 'https://example.test/c/1',
        credentialRef: 'anything',
        credentialAad: 'aad',
    });
    assert.deepEqual(result, { ok: false, error: 'no_adapter' });
    assert.equal(fetched, 0);
});

test('posting to a share-link-only platform says so', async () => {
    const result = await postToPlatform({
        platform: 'instagram',
        text: 'hello',
        url: 'https://example.test/c/1',
        credentialRef: 'anything',
        credentialAad: 'aad',
    });
    assert.deepEqual(result, { ok: false, error: 'share_link_only' });
});

// --- the record is served ----------------------------------------------------

test('the platform listing serves the policy and the blockers, not only the flags', async () => {
    const res = await app.request('/v1/coalitions/platforms');
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        platforms: Array<{ platform: string; policy?: unknown; blockers?: string[] }>;
    };
    assert.equal(body.platforms.length, COALITION_PLATFORMS.length);
    for (const row of body.platforms) {
        const platform = row.platform as keyof typeof COALITION_PLATFORM_POLICY;
        assert.deepEqual(row.policy, COALITION_PLATFORM_POLICY[platform]);
        assert.deepEqual(row.blockers, platformAutomationBlockers(platform));
    }
    // A steward is told why X has no switch, in the order they should hear it.
    const x = body.platforms.find((row) => row.platform === 'x');
    assert.deepEqual(x?.blockers, ['no_adapter', 'agreement_unsigned']);
    // The listing describes platforms, never a coalition's connections: no
    // credential-shaped field can be here even by accident.
    assert.ok(!JSON.stringify(body).includes('credentialRef'));
});
