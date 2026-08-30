/**
 * Real-crypto coverage for integrations/oidc-idp.ts (W2): an in-process
 * node:http "MAS" serves discovery + an ephemeral RSA JWKS, and jose does
 * genuine signature/iss/aud/exp verification against it. The route-level
 * flow (which stubs this module) lives in oidc-login.integration.test.ts.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createSecretKey, randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

const { oidcIdp, readOidcRuntimeConfig, isOidcLoginConfigured } = await import(
    '../src/integrations/oidc-idp'
);

const CLIENT_ID = '000000000000000000000BKAPI';
const REDIRECT = 'https://app.test.local/auth/callback';

// --- ephemeral IdP ---------------------------------------------------------

const { publicKey, privateKey } = await generateKeyPair('RS256');
const publicJwk: JWK = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig' };

interface IdpState {
    /** Extra fields spread over the discovery doc (falsy value = knock a field out). */
    discoveryPatch: Record<string, unknown>;
    includeUserinfo: boolean;
    tokenStatus: number;
    tokenResponse: Record<string, unknown>;
    discoveryHits: number;
    lastTokenBody?: URLSearchParams;
    lastUserinfoAuth?: string;
}

const state: IdpState = {
    discoveryPatch: {},
    includeUserinfo: true,
    tokenStatus: 200,
    tokenResponse: {},
    discoveryHits: 0,
};

const resetIdpState = () => {
    state.discoveryPatch = {};
    state.includeUserinfo = true;
    state.tokenStatus = 200;
    state.tokenResponse = {};
    state.discoveryHits = 0;
    state.lastTokenBody = undefined;
    state.lastUserinfoAuth = undefined;
    oidcIdp.resetCachesForTests();
};

const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', ISSUER).pathname;
    const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    };
    if (path === '/.well-known/openid-configuration') {
        state.discoveryHits += 1;
        json(200, {
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/authorize`,
            token_endpoint: `${ISSUER}/oauth2/token`,
            jwks_uri: `${ISSUER}/oauth2/keys.json`,
            ...(state.includeUserinfo ? { userinfo_endpoint: `${ISSUER}/oauth2/userinfo` } : {}),
            id_token_signing_alg_values_supported: ['RS256'],
            ...state.discoveryPatch,
        });
        return;
    }
    if (path === '/oauth2/keys.json') {
        json(200, { keys: [publicJwk] });
        return;
    }
    if (path === '/oauth2/token') {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
            state.lastTokenBody = new URLSearchParams(raw);
            if (state.tokenStatus !== 200) {
                json(state.tokenStatus, { error: 'invalid_grant' });
                return;
            }
            json(200, state.tokenResponse);
        });
        return;
    }
    if (path === '/oauth2/userinfo') {
        state.lastUserinfoAuth = req.headers.authorization;
        json(200, { sub: '01JMASULID0000000000000000', preferred_username: 'ibis' });
        return;
    }
    json(404, { error: 'not_found' });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (address === null || typeof address === 'string') throw new Error('no server port');
const ISSUER = `http://127.0.0.1:${address.port}`;
after(() => server.close());

// --- env plumbing ----------------------------------------------------------

const OIDC_KEYS = [
    'BLACKOUT_OIDC_ISSUER',
    'BLACKOUT_OIDC_CLIENT_ID',
    'BLACKOUT_OIDC_CLIENT_SECRET',
    'BLACKOUT_OIDC_REDIRECT_ALLOWLIST',
    'BLACKOUT_OIDC_SCOPES',
] as const;

const withIdpEnv = async (
    fn: () => Promise<void>,
    overrides: Partial<Record<typeof OIDC_KEYS[number], string>> = {}
) => {
    const prev: Record<string, string | undefined> = {};
    const values: Record<string, string> = {
        BLACKOUT_OIDC_ISSUER: ISSUER,
        BLACKOUT_OIDC_CLIENT_ID: CLIENT_ID,
        BLACKOUT_OIDC_CLIENT_SECRET: 'unit-secret',
        BLACKOUT_OIDC_REDIRECT_ALLOWLIST: REDIRECT,
        ...overrides,
    };
    for (const key of OIDC_KEYS) {
        prev[key] = process.env[key];
        if (values[key] === undefined) delete process.env[key];
        else process.env[key] = values[key];
    }
    resetIdpState();
    try {
        await fn();
    } finally {
        for (const key of OIDC_KEYS) {
            if (prev[key] === undefined) delete process.env[key];
            else process.env[key] = prev[key];
        }
        oidcIdp.resetCachesForTests();
    }
};

const mintIdToken = async (
    claims: Record<string, unknown>,
    opts: {
        iss?: string;
        aud?: string;
        exp?: string | number;
        key?: Parameters<SignJWT['sign']>[0];
        alg?: string;
    } = {}
): Promise<string> =>
    new SignJWT(claims)
        .setProtectedHeader({ alg: opts.alg ?? 'RS256' })
        .setIssuer(opts.iss ?? ISSUER)
        .setAudience(opts.aud ?? CLIENT_ID)
        .setSubject('01JMASULID0000000000000000')
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? '5m')
        .sign(opts.key ?? privateKey);

const joseCode = (expected: string) => (error: unknown) => {
    assert.ok(error instanceof Error, 'rejection is an Error');
    assert.equal(
        (error as { code?: string }).code,
        expected,
        `${error.message} [${String((error as { code?: string }).code)}]`
    );
    return true;
};

// --- tests -----------------------------------------------------------------

test('readOidcRuntimeConfig requires the full variable set and normalizes it', async () => {
    // All four unset → dark.
    await withIdpEnv(
        async () => {
            assert.equal(readOidcRuntimeConfig(), null);
            assert.equal(isOidcLoginConfigured(), false);
        },
        {
            BLACKOUT_OIDC_ISSUER: undefined as unknown as string,
            BLACKOUT_OIDC_CLIENT_ID: undefined as unknown as string,
            BLACKOUT_OIDC_CLIENT_SECRET: undefined as unknown as string,
            BLACKOUT_OIDC_REDIRECT_ALLOWLIST: undefined as unknown as string,
        }
    );
    // Partial config is still dark — no half-enabled login surface.
    await withIdpEnv(
        async () => {
            assert.equal(readOidcRuntimeConfig(), null);
        },
        { BLACKOUT_OIDC_CLIENT_SECRET: undefined as unknown as string }
    );
    await withIdpEnv(
        async () => {
            assert.equal(readOidcRuntimeConfig(), null);
        },
        { BLACKOUT_OIDC_REDIRECT_ALLOWLIST: '  ,  ' }
    );
    // Full config: trailing slash trimmed, allowlist split + trimmed, scope default.
    await withIdpEnv(
        async () => {
            const config = readOidcRuntimeConfig();
            assert.ok(config);
            assert.equal(config.issuer, ISSUER);
            assert.deepEqual(config.redirectAllowlist, [REDIRECT, 'https://other.test.local/cb']);
            assert.equal(config.scopes, 'openid profile');
            assert.equal(isOidcLoginConfigured(), true);
        },
        {
            BLACKOUT_OIDC_ISSUER: `${ISSUER}///`,
            BLACKOUT_OIDC_REDIRECT_ALLOWLIST: ` ${REDIRECT} , https://other.test.local/cb ,`,
        }
    );
    // Explicit scopes override the default.
    await withIdpEnv(
        async () => {
            assert.equal(readOidcRuntimeConfig()?.scopes, 'openid profile email');
        },
        { BLACKOUT_OIDC_SCOPES: 'openid profile email' }
    );
});

test('discover() validates the issuer echo and caches the document', async () => {
    await withIdpEnv(async () => {
        const doc = await oidcIdp.discover();
        assert.equal(doc.issuer, ISSUER);
        assert.equal(doc.token_endpoint, `${ISSUER}/oauth2/token`);
        assert.equal(doc.jwks_uri, `${ISSUER}/oauth2/keys.json`);
        assert.equal(state.discoveryHits, 1);
        // Cached: a second call must not refetch.
        await oidcIdp.discover();
        assert.equal(state.discoveryHits, 1);
    });

    // Issuer echo mismatch (OIDC Discovery §4.3) is fatal.
    await withIdpEnv(async () => {
        state.discoveryPatch = { issuer: 'https://impostor.test.local' };
        await assert.rejects(oidcIdp.discover(), /issuer mismatch/);
    });

    // Incomplete document is fatal.
    await withIdpEnv(async () => {
        state.discoveryPatch = { token_endpoint: '' };
        await assert.rejects(oidcIdp.discover(), /incomplete/);
    });

    // Unconfigured → typed failure, no fetch.
    await withIdpEnv(
        async () => {
            await assert.rejects(oidcIdp.discover(), /oidc_not_configured/);
            assert.equal(state.discoveryHits, 0);
        },
        { BLACKOUT_OIDC_ISSUER: undefined as unknown as string }
    );
});

test('verifyIdToken accepts a properly signed token and returns its claims', async () => {
    await withIdpEnv(async () => {
        const idToken = await mintIdToken({ nonce: 'n-1', preferred_username: 'ibis' });
        const claims = await oidcIdp.verifyIdToken({ idToken, nonce: 'n-1' });
        assert.equal(claims.sub, '01JMASULID0000000000000000');
        assert.equal(claims.preferred_username, 'ibis');
        assert.equal(claims.nonce, 'n-1');
    });
});

test('verifyIdToken rejects a token minted for another audience', async () => {
    await withIdpEnv(async () => {
        const idToken = await mintIdToken({ nonce: 'n-1' }, { aud: 'someone-else' });
        await assert.rejects(
            oidcIdp.verifyIdToken({ idToken, nonce: 'n-1' }),
            joseCode('ERR_JWT_CLAIM_VALIDATION_FAILED')
        );
    });
});

test('verifyIdToken rejects a nonce that does not match the transaction', async () => {
    await withIdpEnv(async () => {
        const idToken = await mintIdToken({ nonce: 'n-1' });
        await assert.rejects(oidcIdp.verifyIdToken({ idToken, nonce: 'n-2' }), /nonce mismatch/);
    });
});

test('verifyIdToken rejects an expired token', async () => {
    await withIdpEnv(async () => {
        const idToken = await mintIdToken(
            { nonce: 'n-1' },
            { exp: Math.floor(Date.now() / 1000) - 300 }
        );
        await assert.rejects(
            oidcIdp.verifyIdToken({ idToken, nonce: 'n-1' }),
            joseCode('ERR_JWT_EXPIRED')
        );
    });
});

test('verifyIdToken rejects a token from another issuer', async () => {
    await withIdpEnv(async () => {
        const idToken = await mintIdToken({ nonce: 'n-1' }, { iss: 'https://impostor.test.local' });
        await assert.rejects(
            oidcIdp.verifyIdToken({ idToken, nonce: 'n-1' }),
            joseCode('ERR_JWT_CLAIM_VALIDATION_FAILED')
        );
    });
});

test('verifyIdToken rejects an alg outside the advertised set', async () => {
    await withIdpEnv(async () => {
        // HS256-signed token: the discovery doc advertises RS256 only, so jose
        // must refuse the header before any key resolution happens.
        const idToken = await mintIdToken(
            { nonce: 'n-1' },
            { alg: 'HS256', key: createSecretKey(randomBytes(32)) }
        );
        await assert.rejects(
            oidcIdp.verifyIdToken({ idToken, nonce: 'n-1' }),
            joseCode('ERR_JOSE_ALG_NOT_ALLOWED')
        );
    });
});

test('verifyIdToken rejects a signature the JWKS cannot validate', async () => {
    await withIdpEnv(async () => {
        const { privateKey: strangerKey } = await generateKeyPair('RS256');
        const idToken = await mintIdToken({ nonce: 'n-1' }, { key: strangerKey });
        await assert.rejects(oidcIdp.verifyIdToken({ idToken, nonce: 'n-1' }));
    });
});

test('exchangeCode posts the PKCE form and returns the token payload', async () => {
    await withIdpEnv(async () => {
        state.tokenResponse = { access_token: 'at-1', id_token: 'idt-1', token_type: 'Bearer' };
        const tokens = await oidcIdp.exchangeCode({
            code: 'code-1',
            redirectUri: REDIRECT,
            codeVerifier: 'verifier-1',
        });
        assert.equal(tokens.access_token, 'at-1');
        assert.equal(tokens.id_token, 'idt-1');
        const body = state.lastTokenBody;
        assert.ok(body);
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(body.get('client_id'), CLIENT_ID);
        assert.equal(body.get('client_secret'), 'unit-secret');
        assert.equal(body.get('code'), 'code-1');
        assert.equal(body.get('redirect_uri'), REDIRECT);
        assert.equal(body.get('code_verifier'), 'verifier-1');
    });

    // Upstream rejection surfaces the status, never a fabricated token.
    await withIdpEnv(async () => {
        state.tokenStatus = 400;
        await assert.rejects(
            oidcIdp.exchangeCode({ code: 'bad', redirectUri: REDIRECT, codeVerifier: 'v' }),
            /token exchange failed: 400/
        );
    });
});

test('fetchUserinfo sends the bearer token; null when the issuer has no endpoint', async () => {
    await withIdpEnv(async () => {
        const claims = await oidcIdp.fetchUserinfo('at-123');
        assert.ok(claims);
        assert.equal(claims.preferred_username, 'ibis');
        assert.equal(state.lastUserinfoAuth, 'Bearer at-123');
    });

    await withIdpEnv(async () => {
        state.includeUserinfo = false;
        assert.equal(await oidcIdp.fetchUserinfo('at-123'), null);
    });
});
