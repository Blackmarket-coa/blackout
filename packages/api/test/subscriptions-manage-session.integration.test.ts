// POST /v1/subscriptions/manage-session — the Blackout half of FBM's
// manage-session contract (2026-10-06). The route mints a short-lived link to
// FBM's hosted subscription management page through the FBM provider. These
// tests run against the in-memory FBM stub and pin: auth, the fail-closed
// server flag, that the user id reaching FBM is the verified token's `sub`,
// the return-URL allowlist, and that the link (a bearer capability) never
// lands in the audit timeline or the logs.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.FREEBLACKMARKET_BASE_URL = 'https://api.freeblackmarket.test';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'test-webhook-secret';
process.env.FREEBLACKMARKET_STUB = '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.blackout.test';
delete process.env.FBM_MANAGE_SESSION_ENABLED;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { clearCorsConfigCache } = await import('../src/config/cors');
const { getMarketplaceProvider } = await import('../src/integrations/marketplace');
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);
const { getSubscriptionAuditTimeline } = await import('../src/services/subscriptions');

clearCorsConfigCache();

const USER_ID = 'manage-user-1';
const USERNAME = 'manage-user';
const PATH = '/v1/subscriptions/manage-session';

function ensureUser(id: string, username: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username,
        email: `${username}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function headers(): Record<string, string> {
    ensureUser(USER_ID, USERNAME);
    return {
        authorization: `Bearer ${signJwt(USER_ID, USERNAME, 600)}`,
        'content-type': 'application/json',
    };
}

function fbm() {
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider, 'freeblackmarket provider is registered');
    return provider;
}

function stub() {
    const internals = getFreeblackmarketStubInternals(fbm());
    assert.ok(internals, 'the FBM stub is in use');
    return internals;
}

function post(body: unknown, withAuth = true): Promise<Response> {
    return app.request(PATH, {
        method: 'POST',
        headers: withAuth ? headers() : { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function withFlag<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
    const saved = process.env.FBM_MANAGE_SESSION_ENABLED;
    if (value === undefined) delete process.env.FBM_MANAGE_SESSION_ENABLED;
    else process.env.FBM_MANAGE_SESSION_ENABLED = value;
    try {
        return await run();
    } finally {
        if (saved === undefined) delete process.env.FBM_MANAGE_SESSION_ENABLED;
        else process.env.FBM_MANAGE_SESSION_ENABLED = saved;
    }
}

/** Run `fn` while capturing everything written through console.*. */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
    const lines: string[] = [];
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const saved = methods.map((m) => console[m]);
    for (const m of methods) {
        console[m] = (...args: unknown[]) => {
            lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
        };
    }
    try {
        const result = await fn();
        return { result, output: lines.join('\n') };
    } finally {
        methods.forEach((m, i) => {
            console[m] = saved[i];
        });
    }
}

test('requires a signed-in user', async () => {
    await withFlag('true', async () => {
        const res = await post({}, false);
        assert.equal(res.status, 401);
    });
});

test('fails closed with 503 while FBM_MANAGE_SESSION_ENABLED is unset or off', async () => {
    stub().reset();
    for (const value of [undefined, 'false', '0', 'yes']) {
        await withFlag(value, async () => {
            const res = await post({});
            assert.equal(res.status, 503, `flag=${String(value)}`);
            const body = (await res.json()) as { code: string; url?: string };
            assert.equal(body.code, 'billing_unavailable');
            assert.equal('url' in body, false);
        });
    }
    assert.equal(stub().listManageSessionMints().length, 0, 'nothing reached FBM');
});

test('mints a link for user.sub and ignores a userId in the body', async () => {
    stub().reset();
    await withFlag('true', async () => {
        const res = await post({ userId: 'someone-else' });
        assert.equal(res.status, 201);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        const body = (await res.json()) as Record<string, unknown>;
        assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'url']);
        const url = new URL(body.url as string);
        assert.equal(url.protocol, 'https:');
        assert.equal(url.origin, 'https://api.freeblackmarket.test');
        assert.match(
            url.pathname,
            /^\/v1\/integrations\/blackout\/commerce\/subscriptions\/manage-sessions\/[^/]+\/page$/
        );
        assert.ok(Date.parse(body.expiresAt as string) > Date.now());

        const mints = stub().listManageSessionMints();
        assert.equal(mints.length, 1);
        assert.equal(mints[0].userId, USER_ID);
    });
});

test('passes an allowlisted returnUrl and drops everything else', async () => {
    const cases: Array<[string, string | undefined]> = [
        // Cut to origin + "/": the open space, room and event never reach FBM.
        ['https://app.blackout.test/settings', 'https://app.blackout.test/'],
        [
            'https://app.blackout.test/communities/!space:x/!room:y?event=$evt&panel=thread#m',
            'https://app.blackout.test/',
        ],
        ['blackout://checkout/return', 'blackout://checkout/return'],
        ['https://evil.example/phish', undefined],
        ['http://app.blackout.test/settings', undefined],
        ['javascript:alert(1)', undefined],
        ['https://user:pass@app.blackout.test/', undefined],
        ['not a url', undefined],
    ];
    await withFlag('1', async () => {
        for (const [returnUrl, expected] of cases) {
            stub().reset();
            const res = await post({ returnUrl });
            assert.equal(res.status, 201, returnUrl);
            const mints = stub().listManageSessionMints();
            assert.equal(mints.length, 1);
            assert.equal(mints[0].returnUrl, expected, returnUrl);
        }
    });
});

test('a wildcard CORS config forwards no returnUrl at all', async () => {
    const saved = process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOWED_ORIGINS = '*';
    clearCorsConfigCache();
    try {
        await withFlag('1', async () => {
            for (const returnUrl of ['https://app.blackout.test/', 'https://evil.example/']) {
                stub().reset();
                const res = await post({ returnUrl });
                assert.equal(res.status, 201, returnUrl);
                assert.equal(stub().listManageSessionMints()[0].returnUrl, undefined, returnUrl);
            }
            // The native deep link is an exact match, not an origin.
            stub().reset();
            await post({ returnUrl: 'blackout://checkout/return' });
            assert.equal(
                stub().listManageSessionMints()[0].returnUrl,
                'blackout://checkout/return'
            );
        });
    } finally {
        process.env.CORS_ALLOWED_ORIGINS = saved;
        clearCorsConfigCache();
    }
});

test('rejects an oversized returnUrl', async () => {
    await withFlag('true', async () => {
        const res = await post({ returnUrl: `https://app.blackout.test/${'a'.repeat(2100)}` });
        assert.equal(res.status, 400);
    });
});

test('never writes the link to the audit timeline or the logs', async () => {
    stub().reset();
    await withFlag('true', async () => {
        const { result, output } = await captureConsole(() => post({}));
        assert.equal(result.status, 201);
        const { url } = (await result.json()) as { url: string };
        const token = new URL(url).pathname.split('/').at(-2) ?? '';
        assert.ok(token.length > 20);

        assert.equal(output.includes(token), false, 'token absent from logs');

        const timeline = getSubscriptionAuditTimeline(USER_ID);
        const minted = timeline.filter((e) => e.type === 'billing.manage_session_created');
        assert.ok(minted.length >= 1, 'the mint is audited');
        const serialized = JSON.stringify(timeline);
        assert.equal(serialized.includes(token), false, 'token absent from audit');
        assert.equal(serialized.includes(url), false, 'url absent from audit');
    });
});

test('maps FBM refusals onto Blackout answers', async () => {
    const provider = fbm();
    const original = provider.createSubscriptionManageSession;
    const failWith = (status: number, bodyCode?: string) => {
        provider.createSubscriptionManageSession = async () => {
            const error = new Error(
                `freeblackmarket manage-sessions failed: ${status}`
            ) as Error & {
                status?: number;
                bodyCode?: string;
            };
            error.status = status;
            if (bodyCode) error.bodyCode = bodyCode;
            throw error;
        };
    };
    try {
        await withFlag('true', async () => {
            // FBM's feature flag (or its Blackout integration) is off.
            failWith(404, 'feature_disabled');
            let res = await post({});
            assert.equal(res.status, 503);
            assert.equal(((await res.json()) as { code: string }).code, 'billing_unavailable');

            // Any other 404 is a wrong prefix or base URL, not "flag off".
            failWith(404);
            res = await post({});
            assert.equal(res.status, 502);
            assert.equal(((await res.json()) as { code: string }).code, 'manage_session_failed');

            // More than one FBM customer carries this user id: fail closed.
            failWith(409);
            res = await post({});
            assert.equal(res.status, 409);
            assert.equal(
                ((await res.json()) as { code: string }).code,
                'billing_identity_ambiguous'
            );

            failWith(500);
            res = await post({});
            assert.equal(res.status, 502);
            assert.equal(((await res.json()) as { code: string }).code, 'manage_session_failed');

            // A provider that cannot mint at all is "not available", not broken.
            provider.createSubscriptionManageSession = undefined;
            res = await post({});
            assert.equal(res.status, 503);
        });
    } finally {
        provider.createSubscriptionManageSession = original;
    }
});
