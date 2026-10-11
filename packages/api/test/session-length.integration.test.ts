/**
 * Launch-plan step B3: a Black Mask panel sign-in has a length the homeserver
 * enforces, and the Blackout API session exchanged from it must end with it.
 *
 * The homeserver is stubbed at `matrixClient.whoami` / `matrixClient.sessionLength`
 * (its own enforcement is tested in apps/blackout-server's
 * tests/blackout_runtime/test_session_length.py). "After the session ends" is
 * reached by moving `Date.now`, so nothing here depends on a client timer:
 * every refusal below is the API refusing on its own.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
// Provision on exchange, as account-number deployments do.
process.env.BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS = '1';
delete process.env.BLACKOUT_SESSION_LENGTHS;

const { default: app } = await import('../src/index');
const { matrixClient } = await import('../src/integrations/matrix-client');
const { verifyJwt, readAuthRuntimeConfig } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __test__: refreshInternals } = await import('../src/services/refreshToken');

const HOUR_MS = 60 * 60 * 1000;
const DAY_S = 24 * 60 * 60;

type WhoamiResult = Awaited<ReturnType<typeof matrixClient.whoami>>;
type SessionLengthResult = Awaited<ReturnType<typeof matrixClient.sessionLength>>;

/** Stub the homeserver: who the token belongs to, and when its session ends. */
const stubHomeserver = (localpart: string, length: SessionLengthResult | (() => never)) => {
    const calls = { sessionLength: 0 };
    const whoami = mock.method(
        matrixClient,
        'whoami',
        async (): Promise<WhoamiResult> => ({
            ok: true,
            status: 200,
            userId: `@${localpart}:theblackout.app`,
            deviceId: 'PANELDEVICE',
        })
    );
    const sessionLength = mock.method(
        matrixClient,
        'sessionLength',
        async (): Promise<SessionLengthResult> => {
            calls.sessionLength += 1;
            if (typeof length === 'function') return length();
            return length;
        }
    );
    return {
        calls,
        restore: () => {
            whoami.mock.restore();
            sessionLength.mock.restore();
        },
    };
};

const withSessionLengths = async (fn: () => Promise<void>) => {
    const prev = process.env.BLACKOUT_SESSION_LENGTHS;
    process.env.BLACKOUT_SESSION_LENGTHS = '1';
    try {
        await fn();
    } finally {
        if (prev === undefined) delete process.env.BLACKOUT_SESSION_LENGTHS;
        else process.env.BLACKOUT_SESSION_LENGTHS = prev;
    }
};

/** Move the API's clock (everything it compares against reads `Date.now`). */
const atTime = (ms: number) => mock.method(Date, 'now', () => ms);

const exchange = (body: unknown = {}) =>
    app.request('/v1/auth/matrix/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-matrix-access-token': 'mx_token' },
        body: JSON.stringify(body),
    });

const refresh = (refreshToken: string) =>
    app.request('/v1/auth/token/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
    });

/** Any authenticated route will do; this one has no side effects. */
const useToken = (token: string) =>
    app.request('/v1/channel-access/me', { headers: { authorization: `Bearer ${token}` } });

const refreshRecord = (token: string) => db.findRefreshTokenByHash(refreshInternals.sha256(token));

type ExchangeBody = { token: string; refreshToken: string; userId: string };

const uniqueLocalpart = (tag: string) => `sl-${tag}-${randomUUID().slice(0, 8)}`;

test('flag off: the exchange never asks the homeserver and issues exactly what it always did', async () => {
    const stub = stubHomeserver(uniqueLocalpart('off'), {
        ok: true,
        status: 200,
        sessionLength: '1h',
        expiresAtMs: Date.now() + HOUR_MS,
    });
    try {
        const before = Math.floor(Date.now() / 1000);
        const res = await exchange();
        assert.equal(res.status, 200);
        const body = (await res.json()) as ExchangeBody;
        assert.equal(stub.calls.sessionLength, 0, 'flag off must not add a homeserver request');

        const payload = verifyJwt(body.token);
        assert.ok(payload);
        assert.equal(payload.sxp, undefined);
        assert.equal('sxp' in payload, false);
        assert.ok(payload.exp - payload.iat === DAY_S, 'the usual 24h access token');
        assert.ok(payload.iat >= before);

        const record = refreshRecord(body.refreshToken);
        assert.ok(record);
        assert.equal(record.sessionExpiresAt, undefined);
        assert.equal('sessionExpiresAt' in record, false);
        const days = (new Date(record.expiresAt).getTime() - Date.now()) / (DAY_S * 1000);
        assert.ok(days > 29.9 && days <= 30, 'the usual 30-day refresh token');
    } finally {
        stub.restore();
    }
});

test('flag off: GET /v1/auth/session-lengths is the same 404 as an unknown route', async () => {
    const res = await app.request('/v1/auth/session-lengths');
    const unknown = await app.request('/v1/auth/no-such-route-here');
    assert.equal(res.status, 404);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await res.json(), await unknown.json());
});

test('flag on: GET /v1/auth/session-lengths lists the lengths', async () => {
    await withSessionLengths(async () => {
        const res = await app.request('/v1/auth/session-lengths');
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), {
            enforced: true,
            sessionLengths: ['1h', '1d', '7d', '30d', 'until_sign_out'],
        });
    });
});

test('an hour-long session: tokens are capped, then refused on use and on refresh', async () => {
    await withSessionLengths(async () => {
        const start = Date.now();
        const endMs = start + HOUR_MS;
        const endS = Math.floor(endMs / 1000);
        const stub = stubHomeserver(uniqueLocalpart('hour'), {
            ok: true,
            status: 200,
            sessionLength: '1h',
            expiresAtMs: endMs,
        });
        try {
            // A tampering client asking for more changes nothing: the API takes
            // no length from the client at all.
            const res = await exchange({ session_length: 'until_sign_out', expiresAtMs: 0 });
            assert.equal(res.status, 200);
            assert.equal(stub.calls.sessionLength, 1);
            const first = (await res.json()) as ExchangeBody;

            const payload = verifyJwt(first.token);
            assert.ok(payload);
            assert.equal(payload.sxp, endS);
            assert.equal(payload.exp, endS, 'access token capped at the session end, not 24h');

            const record = refreshRecord(first.refreshToken);
            assert.ok(record);
            assert.equal(record.sessionExpiresAt, new Date(endMs).toISOString());
            assert.equal(record.expiresAt, new Date(endMs).toISOString());

            assert.equal((await useToken(first.token)).status, 200);

            // 50 minutes in: refreshing works, and stays inside the hour.
            const clock = atTime(start + 50 * 60 * 1000);
            const refreshed = await refresh(first.refreshToken);
            assert.equal(refreshed.status, 200);
            const second = (await refreshed.json()) as ExchangeBody;
            const secondPayload = verifyJwt(second.token);
            assert.ok(secondPayload);
            assert.equal(secondPayload.sxp, endS);
            assert.ok(secondPayload.exp <= endS);
            const successor = refreshRecord(second.refreshToken);
            assert.ok(successor);
            assert.equal(successor.sessionExpiresAt, new Date(endMs).toISOString());
            assert.equal(successor.expiresAt, new Date(endMs).toISOString());
            assert.equal(successor.familyId, record.familyId);
            assert.equal((await useToken(second.token)).status, 200);
            clock.mock.restore();

            // Past the end: every token is refused, however often it is shown.
            const late = atTime(endMs + 1000);
            try {
                for (let i = 0; i < 3; i += 1) {
                    assert.equal((await useToken(first.token)).status, 401);
                    assert.equal((await useToken(second.token)).status, 401);
                    assert.equal(verifyJwt(second.token), null);
                }
                const ended = await refresh(second.refreshToken);
                assert.equal(ended.status, 401);
                assert.equal(((await ended.json()) as { code: string }).code, 'session_expired');
                // The family is burned, so presenting it again stays refused.
                const again = await refresh(second.refreshToken);
                assert.equal(again.status, 401);
                assert.equal(
                    ((await again.json()) as { code: string }).code,
                    'refresh_token_revoked'
                );
                // And a fresh exchange is refused too: the homeserver says the
                // session is over (in production its token would already 401).
                const reExchange = await exchange();
                assert.equal(reExchange.status, 401);
                assert.equal(
                    ((await reExchange.json()) as { code: string }).code,
                    'matrix_session_expired'
                );
            } finally {
                late.mock.restore();
            }
        } finally {
            stub.restore();
        }
    });
});

test('a bound already issued holds after the flag is turned off', async () => {
    const start = Date.now();
    const endMs = start + HOUR_MS;
    let issued: ExchangeBody | undefined;
    await withSessionLengths(async () => {
        const stub = stubHomeserver(uniqueLocalpart('sticky'), {
            ok: true,
            status: 200,
            sessionLength: '1h',
            expiresAtMs: endMs,
        });
        try {
            issued = (await (await exchange()).json()) as ExchangeBody;
        } finally {
            stub.restore();
        }
    });
    assert.ok(issued);
    assert.equal(process.env.BLACKOUT_SESSION_LENGTHS, undefined);

    const late = atTime(endMs + 1000);
    try {
        assert.equal((await useToken(issued.token)).status, 401);
        const ended = await refresh(issued.refreshToken);
        assert.equal(ended.status, 401);
        assert.equal(((await ended.json()) as { code: string }).code, 'session_expired');
    } finally {
        late.mock.restore();
    }
});

test('a stored session end that cannot be read counts as ended, never as no end', async () => {
    const userId = randomUUID();
    db.createUser({
        id: userId,
        username: uniqueLocalpart('garbled'),
        passwordHash: '',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const plaintext = `garbled-${randomUUID()}`;
    db.createRefreshToken({
        id: randomUUID(),
        userId,
        familyId: randomUUID(),
        tokenHash: refreshInternals.sha256(plaintext),
        expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
        sessionExpiresAt: 'not-a-date',
    });
    const res = await refresh(plaintext);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { code: string }).code, 'session_expired');
});

test('until sign out, or a homeserver without the feature: no added bound', async () => {
    await withSessionLengths(async () => {
        const cases: SessionLengthResult[] = [
            { ok: true, status: 200, sessionLength: 'until_sign_out', expiresAtMs: null },
            { ok: true, status: 200, sessionLength: null, expiresAtMs: null },
            { ok: false, status: 404, reason: 'unsupported' },
        ];
        for (const outcome of cases) {
            const stub = stubHomeserver(uniqueLocalpart('open'), outcome);
            try {
                const res = await exchange();
                assert.equal(res.status, 200, JSON.stringify(outcome));
                const body = (await res.json()) as ExchangeBody;
                const payload = verifyJwt(body.token);
                assert.ok(payload);
                assert.equal(payload.sxp, undefined);
                assert.equal(payload.exp - payload.iat, DAY_S);
                const record = refreshRecord(body.refreshToken);
                assert.ok(record);
                assert.equal(record.sessionExpiresAt, undefined);
            } finally {
                stub.restore();
            }
        }
    });
});

test('flag on: when the session end cannot be confirmed, nothing is issued', async () => {
    await withSessionLengths(async () => {
        const failures: SessionLengthResult[] = [
            { ok: false, reason: 'network_error', detail: 'ECONNRESET' },
            { ok: false, status: 500, reason: 'upstream_error' },
            { ok: false, status: 200, reason: 'bad_response' },
            { ok: false, reason: 'matrix_not_configured' },
        ];
        for (const outcome of failures) {
            const localpart = uniqueLocalpart('unknown');
            const stub = stubHomeserver(localpart, outcome);
            try {
                const res = await exchange();
                assert.equal(res.status, 503, JSON.stringify(outcome));
                const body = (await res.json()) as { code: string; token?: string };
                assert.equal(body.code, 'matrix_session_length_unavailable');
                assert.equal(body.token, undefined);
                assert.equal(db.findUserByUsername(localpart), undefined, 'no account row either');
            } finally {
                stub.restore();
            }
        }

        const stub = stubHomeserver(uniqueLocalpart('dead'), {
            ok: false,
            status: 401,
            reason: 'invalid_token',
        });
        try {
            const res = await exchange();
            assert.equal(res.status, 401);
            assert.equal(((await res.json()) as { code: string }).code, 'matrix_token_invalid');
        } finally {
            stub.restore();
        }
    });
});

// Without migration 100 the Postgres store drops a family's end on write, so
// the end would be gone after a restart. The API must not claim, or issue, an
// end it cannot keep.
test('flag on, but nowhere to keep a session end: not enforced, and timed exchanges refused', async () => {
    await withSessionLengths(async () => {
        const storage = mock.method(db, 'persistsRefreshTokenSessionEnds', () => false);
        try {
            const lengths = await app.request('/v1/auth/session-lengths');
            assert.equal(lengths.status, 503);
            const lengthsBody = (await lengths.json()) as { enforced: unknown; code: string };
            assert.equal(lengthsBody.enforced, false);
            assert.equal(lengthsBody.code, 'session_end_storage_missing');

            const localpart = uniqueLocalpart('nocol');
            const timed = stubHomeserver(localpart, {
                ok: true,
                status: 200,
                sessionLength: '1h',
                expiresAtMs: Date.now() + HOUR_MS,
            });
            try {
                const res = await exchange();
                assert.equal(res.status, 503);
                const body = (await res.json()) as { code: string; token?: string };
                assert.equal(body.code, 'matrix_session_length_unavailable');
                assert.equal(body.token, undefined);
                assert.equal(db.findUserByUsername(localpart), undefined, 'no account row either');
            } finally {
                timed.restore();
            }

            // A session with no end needs nothing kept: issued as usual.
            const open = stubHomeserver(uniqueLocalpart('nocol-open'), {
                ok: true,
                status: 200,
                sessionLength: 'until_sign_out',
                expiresAtMs: null,
            });
            try {
                const res = await exchange();
                assert.equal(res.status, 200);
                const payload = verifyJwt(((await res.json()) as ExchangeBody).token);
                assert.ok(payload);
                assert.equal(payload.sxp, undefined);
            } finally {
                open.restore();
            }
        } finally {
            storage.mock.restore();
        }
        // The in-memory store used here keeps whole records.
        assert.equal(db.persistsRefreshTokenSessionEnds(), true);
    });
});

test('verification refuses a token past its session end even if exp is later', () => {
    // Hand-sign a token whose exp is a day away but whose session ended a
    // second ago: verifyJwt must refuse on `sxp` alone.
    const config = readAuthRuntimeConfig();
    const now = Math.floor(Date.now() / 1000);
    const sign = (claims: Record<string, unknown>) => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
            'base64url'
        );
        const payload = Buffer.from(
            JSON.stringify({
                sub: 'user-sxp',
                username: 'sxp',
                iat: now - 10,
                exp: now + DAY_S,
                iss: config.issuer,
                aud: config.audience,
                jti: randomUUID(),
                ...claims,
            })
        ).toString('base64url');
        const signature = createHmac('sha256', config.signingSecret)
            .update(`${header}.${payload}`)
            .digest('base64url');
        return `${header}.${payload}.${signature}`;
    };
    assert.ok(verifyJwt(sign({})), 'control: an unbounded token verifies');
    assert.ok(verifyJwt(sign({ sxp: now + 60 })), 'a bounded token verifies before its end');
    assert.equal(verifyJwt(sign({ sxp: now - 1 })), null);
    assert.equal(verifyJwt(sign({ sxp: now })), null, 'the session ends at sxp itself');
    assert.equal(verifyJwt(sign({ sxp: String(now + 60) })), null, 'a malformed sxp is refused');
});

test('matrixClient.sessionLength reads the homeserver strictly', async () => {
    const prevHs = process.env.MATRIX_HOMESERVER;
    process.env.MATRIX_HOMESERVER = 'https://hs.example.test';
    const reply = (status: number, body: unknown) =>
        mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
            assert.equal(
                String(url),
                'https://hs.example.test/_synapse/client/blackout/session/length'
            );
            assert.equal(
                (init?.headers as Record<string, string>).Authorization,
                'Bearer user-token'
            );
            return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
                status,
            });
        });
    try {
        const cases: Array<[number, unknown, string]> = [
            [404, { errcode: 'M_UNRECOGNIZED' }, 'unsupported'],
            [401, { errcode: 'M_UNKNOWN_TOKEN' }, 'invalid_token'],
            [500, { errcode: 'M_UNKNOWN' }, 'upstream_error'],
            [200, 'not json', 'bad_response'],
            [200, { session_length: '1h', expires_at_ms: '1700000000000' }, 'bad_response'],
            [200, { session_length: '1h', expires_at_ms: -5 }, 'bad_response'],
            [200, { session_length: 7, expires_at_ms: null }, 'bad_response'],
            [200, { session_length: '1h' }, 'bad_response'],
        ];
        for (const [status, body, reason] of cases) {
            const fetchMock = reply(status, body);
            try {
                const result = await matrixClient.sessionLength('user-token');
                assert.equal(result.ok, false, JSON.stringify(body));
                assert.equal(!result.ok && result.reason, reason, JSON.stringify(body));
            } finally {
                fetchMock.mock.restore();
            }
        }
        const ok = reply(200, { session_length: '1h', expires_at_ms: 1_700_000_000_000 });
        try {
            assert.deepEqual(await matrixClient.sessionLength('user-token'), {
                ok: true,
                status: 200,
                sessionLength: '1h',
                expiresAtMs: 1_700_000_000_000,
            });
        } finally {
            ok.mock.restore();
        }
        const open = reply(200, { session_length: null, expires_at_ms: null });
        try {
            const result = await matrixClient.sessionLength('user-token');
            assert.equal(result.ok && result.expiresAtMs, null);
        } finally {
            open.mock.restore();
        }
    } finally {
        if (prevHs === undefined) delete process.env.MATRIX_HOMESERVER;
        else process.env.MATRIX_HOMESERVER = prevHs;
    }
});

test('the session end survives a restart of the Postgres-backed store', async () => {
    const { PostgresBackedDb } = await import('../src/db/store');
    const { MIGRATIONS_DIR } = await import('../src/db/migrate');
    const { PGlite } = await import('@electric-sql/pglite');
    type AnyPg = {
        query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
        exec: (sql: string) => Promise<unknown>;
    };
    const pg = new PGlite() as unknown as AnyPg;
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    const client = {
        query: (sql: string, params?: unknown[]) => pg.query(sql, params),
        release: () => {},
    };
    const pool = { connect: async () => client, end: async () => {} } as never;

    const store1 = new PostgresBackedDb();
    await store1.init(pool);
    const userId = randomUUID();
    store1.createUser({
        id: userId,
        username: `pg_${userId.slice(0, 8)}`,
        passwordHash: '',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const endIso = new Date(Date.now() + HOUR_MS).toISOString();
    const expiresIso = new Date(Date.now() + 30 * DAY_S * 1000).toISOString();
    const bounded = store1.createRefreshToken({
        id: randomUUID(),
        userId,
        familyId: randomUUID(),
        tokenHash: 'a'.repeat(64),
        expiresAt: endIso,
        sessionExpiresAt: endIso,
    });
    const open = store1.createRefreshToken({
        id: randomUUID(),
        userId,
        familyId: randomUUID(),
        tokenHash: 'b'.repeat(64),
        expiresAt: expiresIso,
    });
    await store1.drain();

    const store2 = new PostgresBackedDb();
    await store2.init(pool);
    const reloadedBounded = store2.findRefreshTokenByHash('a'.repeat(64));
    const reloadedOpen = store2.findRefreshTokenByHash('b'.repeat(64));
    assert.ok(reloadedBounded && reloadedOpen);
    assert.equal(reloadedBounded.id, bounded.id);
    assert.equal(reloadedBounded.sessionExpiresAt, endIso, 'the bound must not be lost on restart');
    assert.equal(reloadedOpen.id, open.id);
    // A NULL column comes back as an absent field, never as null.
    assert.equal('sessionExpiresAt' in reloadedOpen, false);
    await store2.drain();
});

test('the Postgres-backed store says whether it can keep session ends (migration 100)', async () => {
    const { PostgresBackedDb } = await import('../src/db/store');
    const { MIGRATIONS_DIR } = await import('../src/db/migrate');
    const { PGlite } = await import('@electric-sql/pglite');
    type AnyPg = {
        query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
        exec: (sql: string) => Promise<unknown>;
    };
    const migrated = async (withoutSessionEnds: boolean) => {
        const pg = new PGlite() as unknown as AnyPg;
        const files = readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
            .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
        for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        if (withoutSessionEnds) {
            await pg.exec(
                readFileSync(join(MIGRATIONS_DIR, '100_refresh_token_session_end.down.sql'), 'utf8')
            );
        }
        const client = {
            query: (sql: string, params?: unknown[]) => pg.query(sql, params),
            release: () => {},
        };
        return { connect: async () => client, end: async () => {} } as never;
    };

    const before = new PostgresBackedDb();
    assert.equal(before.persistsRefreshTokenSessionEnds(), false, 'false until init');

    const withColumn = new PostgresBackedDb();
    await withColumn.init(await migrated(false));
    assert.equal(withColumn.persistsRefreshTokenSessionEnds(), true);
    await withColumn.drain();

    const withoutColumn = new PostgresBackedDb();
    await withoutColumn.init(await migrated(true));
    assert.equal(withoutColumn.persistsRefreshTokenSessionEnds(), false);
    await withoutColumn.drain();
});
