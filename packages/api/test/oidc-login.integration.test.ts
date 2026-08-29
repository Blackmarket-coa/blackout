/**
 * Coverage for the native OIDC login against MAS (W2):
 * POST /v1/auth/oidc/begin + /continue (routes/auth-oidc.ts) and the
 * idempotent POST /v1/auth/sign-out. The IdP itself is stubbed by
 * reassignment on the oidcIdp singleton (the matrixClient.whoami precedent);
 * real jose verification is covered separately in oidc-idp.unit.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Oidc-Login-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
// begin() encrypts the PKCE verifier with the linked-accounts secretBox.
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS =
    process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS ??
    `test-key:${Buffer.alloc(32, 7).toString('base64')}`;

const { default: app } = await import('../src/index');
const { oidcIdp } = await import('../src/integrations/oidc-idp');
const { verifyJwt, signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const ISSUER = 'https://mas.test.local';
const REDIRECT = 'https://app.test.local/auth/callback';

const OIDC_ENV = {
    BLACKOUT_OIDC_ISSUER: ISSUER,
    BLACKOUT_OIDC_CLIENT_ID: '000000000000000000000BKAPI',
    BLACKOUT_OIDC_CLIENT_SECRET: 'test-oidc-client-secret',
    BLACKOUT_OIDC_REDIRECT_ALLOWLIST: REDIRECT,
} as const;

const withOidcConfigured = async (fn: () => Promise<void>) => {
    const prev: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(OIDC_ENV)) {
        prev[key] = process.env[key];
        process.env[key] = value;
    }
    try {
        await fn();
    } finally {
        for (const [key, value] of Object.entries(prev)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
};

const withProvisioningTrusted = async (fn: () => Promise<void>) => {
    const prev = process.env.BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS;
    process.env.BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS = '1';
    try {
        await fn();
    } finally {
        if (prev === undefined) delete process.env.BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS;
        else process.env.BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS = prev;
    }
};

const DISCOVERY = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/oauth2/token`,
    jwks_uri: `${ISSUER}/oauth2/keys.json`,
    userinfo_endpoint: `${ISSUER}/oauth2/userinfo`,
};

type Restore = () => void;
const stubDiscover = (): Restore => {
    const original = oidcIdp.discover;
    oidcIdp.discover = async () => DISCOVERY;
    return () => {
        oidcIdp.discover = original;
    };
};

/** Unsigned three-part JWT — enough for jose decodeJwt (no verification). */
const unsignedIdToken = (payload: Record<string, unknown>): string => {
    const enc = (obj: Record<string, unknown>) =>
        Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}.sig`;
};

const begin = (body: Record<string, unknown>) =>
    app.request('/v1/auth/oidc/begin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });

const continueLogin = (body: Record<string, unknown>, token?: string) =>
    app.request('/v1/auth/oidc/continue', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

/** Run begin, return {state, nonce} parsed out of the authorization URL. */
const beginAndExtract = async (): Promise<{ state: string; nonce: string }> => {
    const res = await begin({ redirectUri: REDIRECT });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { authorizationUrl: string; state: string };
    const url = new URL(body.authorizationUrl);
    assert.equal(`${url.origin}${url.pathname}`, DISCOVERY.authorization_endpoint);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
    const state = url.searchParams.get('state');
    const nonce = url.searchParams.get('nonce');
    assert.ok(state && nonce, 'authorization URL carries state + nonce');
    assert.equal(state, body.state);
    return { state: state!, nonce: nonce! };
};

/** Stub the code exchange + verification for one localpart. */
const stubIdp = (nonce: string, claims: Record<string, unknown>): Restore => {
    const originals = {
        exchangeCode: oidcIdp.exchangeCode,
        verifyIdToken: oidcIdp.verifyIdToken,
        fetchUserinfo: oidcIdp.fetchUserinfo,
    };
    const idToken = unsignedIdToken({ nonce, ...claims });
    oidcIdp.exchangeCode = async () => ({ id_token: idToken, access_token: 'at_test' });
    oidcIdp.verifyIdToken = async (params) => {
        assert.equal(params.nonce, nonce, 'route passes the transaction nonce to verification');
        return { nonce, ...claims };
    };
    oidcIdp.fetchUserinfo = async () => null;
    return () => {
        oidcIdp.exchangeCode = originals.exchangeCode;
        oidcIdp.verifyIdToken = originals.verifyIdToken;
        oidcIdp.fetchUserinfo = originals.fetchUserinfo;
    };
};

test('every /v1/auth/oidc route is dark (503) when unconfigured', async () => {
    const beginRes = await begin({ redirectUri: REDIRECT });
    assert.equal(beginRes.status, 503);
    assert.equal(((await beginRes.json()) as { code: string }).code, 'oidc_not_configured');

    const contRes = await continueLogin({ reason: 'login', code: 'x', state: 'y' });
    assert.equal(contRes.status, 503);
    assert.equal(((await contRes.json()) as { code: string }).code, 'oidc_not_configured');
});

test('begin rejects a redirectUri outside the allowlist', async () => {
    await withOidcConfigured(async () => {
        const restore = stubDiscover();
        try {
            const res = await begin({ redirectUri: 'https://evil.example/callback' });
            assert.equal(res.status, 400);
            assert.equal(
                ((await res.json()) as { code: string }).code,
                'oidc_redirect_uri_not_allowed'
            );
        } finally {
            restore();
        }
    });
});

test('login happy path: begin → continue mints a verifiable session for an existing user', async () => {
    await withOidcConfigured(async () => {
        const restoreDiscover = stubDiscover();
        try {
            const localpart = `oidcuser${Date.now()}`;
            db.createUser({
                id: crypto.randomUUID(),
                username: localpart,
                email: `${localpart}@blackout.test`,
                passwordHash: 'x',
                reputationScore: 0,
                reputationTier: 'member',
                pubkeyEd25519: 'pk',
            });

            const { state, nonce } = await beginAndExtract();
            const restoreIdp = stubIdp(nonce, {
                sub: '01JMASULID0000000000000000',
                preferred_username: localpart,
            });
            try {
                const res = await continueLogin({ reason: 'login', code: 'authcode', state });
                assert.equal(res.status, 200);
                const body = (await res.json()) as {
                    event: string;
                    payload: { subject: string; issuer: string; reason: string };
                    session?: { token: string; refreshToken: string; userId: string };
                };
                assert.equal(body.event, 'blackout.auth.session.continued');
                assert.equal(body.payload.reason, 'login');
                assert.equal(body.payload.issuer, ISSUER);
                assert.ok(body.payload.subject.startsWith(`@${localpart}:`));
                assert.ok(body.session?.token, 'additive session carries the API token');
                const payload = verifyJwt(body.session!.token);
                assert.ok(payload, 'minted token verifies with unchanged iss/aud semantics');
                assert.equal(payload!.username, localpart);

                // Single-use state: replay is rejected.
                const replay = await continueLogin({ reason: 'login', code: 'authcode', state });
                assert.equal(replay.status, 401);
                assert.equal(
                    ((await replay.json()) as { code: string }).code,
                    'oidc_state_invalid'
                );
            } finally {
                restoreIdp();
            }
        } finally {
            restoreDiscover();
        }
    });
});

test('unknown localpart: 403 without the trust flag, provisions with it (exchange parity)', async () => {
    await withOidcConfigured(async () => {
        const restoreDiscover = stubDiscover();
        try {
            const localpart = `oidcnew${Date.now()}`;

            // Without the flag: refused with the shared exchange error code.
            {
                const { state, nonce } = await beginAndExtract();
                const restoreIdp = stubIdp(nonce, { sub: 'S1', preferred_username: localpart });
                try {
                    const res = await continueLogin({ reason: 'login', code: 'c', state });
                    assert.equal(res.status, 403);
                    assert.equal(
                        ((await res.json()) as { code: string }).code,
                        'matrix_exchange_provisioning_disabled'
                    );
                    assert.equal(db.findUserByUsername(localpart), undefined);
                } finally {
                    restoreIdp();
                }
            }

            // With the flag: provisions the same row shape as /matrix/exchange.
            await withProvisioningTrusted(async () => {
                const { state, nonce } = await beginAndExtract();
                const restoreIdp = stubIdp(nonce, { sub: 'S1', preferred_username: localpart });
                try {
                    const res = await continueLogin({ reason: 'login', code: 'c', state });
                    assert.equal(res.status, 200);
                    const user = db.findUserByUsername(localpart);
                    assert.ok(user, 'user provisioned');
                    assert.equal(user!.passwordHash, '');
                    assert.equal(user!.email ?? undefined, undefined);
                } finally {
                    restoreIdp();
                }
            });
        } finally {
            restoreDiscover();
        }
    });
});

test('an unusable preferred_username claim is rejected', async () => {
    await withOidcConfigured(async () => {
        const restoreDiscover = stubDiscover();
        try {
            const { state, nonce } = await beginAndExtract();
            const restoreIdp = stubIdp(nonce, {
                sub: 'S2',
                preferred_username: 'NOT A VALID LOCALPART!',
            });
            try {
                const res = await continueLogin({ reason: 'login', code: 'c', state });
                assert.equal(res.status, 401);
                assert.equal(((await res.json()) as { code: string }).code, 'oidc_claims_missing');
            } finally {
                restoreIdp();
            }
        } finally {
            restoreDiscover();
        }
    });
});

test('a bare idToken (no code/state) is refused as unsupported', async () => {
    await withOidcConfigured(async () => {
        const res = await continueLogin({ reason: 'login', idToken: 'x.y.z' });
        assert.equal(res.status, 400);
        assert.equal(((await res.json()) as { code: string }).code, 'oidc_id_token_unsupported');
    });
});

test('an unknown state is rejected without touching the IdP', async () => {
    await withOidcConfigured(async () => {
        const res = await continueLogin({ reason: 'login', code: 'c', state: 'no-such-state' });
        assert.equal(res.status, 401);
        assert.equal(((await res.json()) as { code: string }).code, 'oidc_state_invalid');
    });
});

test("reason:'refresh' requires auth and then describes the current session", async () => {
    await withOidcConfigured(async () => {
        const anon = await continueLogin({ reason: 'refresh' });
        assert.equal(anon.status, 401);

        const userId = crypto.randomUUID();
        const username = `oidcrefresh${Date.now()}`;
        db.createUser({
            id: userId,
            username,
            email: `${username}@blackout.test`,
            passwordHash: 'x',
            reputationScore: 0,
            reputationTier: 'member',
            pubkeyEd25519: 'pk',
        });
        const token = signJwt(userId, username, 600);
        const res = await continueLogin({ reason: 'refresh' }, token);
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
            payload: { subject: string; issuer: string; reason: string };
            session?: unknown;
        };
        assert.equal(body.payload.reason, 'refresh');
        assert.equal(body.payload.issuer, ISSUER);
        assert.ok(body.payload.subject.startsWith(`@${username}:`));
        assert.equal(body.session, undefined, 'refresh mints no new token');
    });
});

test('sign-out is idempotent and revokes a live session', async () => {
    // No session at all → still 200.
    const anon = await app.request('/v1/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(anon.status, 200);
    assert.equal(((await anon.json()) as { ok: boolean }).ok, true);

    // A live session is revoked: the same token is rejected afterwards.
    const userId = crypto.randomUUID();
    const username = `oidcsignout${Date.now()}`;
    db.createUser({
        id: userId,
        username,
        email: `${username}@blackout.test`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const { signJwtWithMeta } = await import('../src/services/auth');
    const signed = signJwtWithMeta(userId, username, 600);
    const res = await app.request('/v1/auth/sign-out', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${signed.token}`,
        },
        body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);

    await withOidcConfigured(async () => {
        const after = await continueLogin({ reason: 'refresh' }, signed.token);
        assert.equal(after.status, 401, 'revoked access token is rejected');
    });
});
