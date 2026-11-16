import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { applySubscriptionWebhookEvent } = await import('../src/services/subscriptions');

function makeUser(username: string): { id: string; token: string } {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@test.local`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: '',
    });
    return { id, token: signJwt(id, username, 600) };
}

/** Activate canopy_pro → `enterprise` entitlement tier → transparency.auditExport. */
function makeAuditEntitledUser(username: string): { id: string; token: string } {
    const user = makeUser(username);
    applySubscriptionWebhookEvent({
        eventId: randomUUID(),
        type: 'invoice.paid',
        userId: user.id,
        planCode: 'canopy_pro_monthly',
    });
    return user;
}

const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

test('GET /v1/transparency/me rejects unauthenticated callers', async () => {
    const res = await app.request('/v1/transparency/me');
    assert.equal(res.status, 401);
});

test('GET /v1/transparency/me returns a free-tier self-report', async () => {
    const user = makeUser(`free_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/me', auth(user.token));
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.userId, user.id);
    assert.equal(body.entitlements.enabled, true);
    assert.equal(body.entitlements.selfReport, true);
    assert.equal(body.entitlements.warrantCanary, true);
    assert.equal(body.entitlements.auditExport, false);
    assert.equal(typeof body.counts.activeBurnerIdentities, 'number');
});

/** Set (or, with undefined, unset) canary settings for one test, and put them back after. */
const canaryEnv = (
    t: { after(fn: () => void): void },
    settings: Record<string, string | undefined>
): void => {
    const before = Object.fromEntries(Object.keys(settings).map((k) => [k, process.env[k]]));
    for (const [key, value] of Object.entries(settings)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(before)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
};

/** A UTC day, `offset` days from today, as YYYY-MM-DD. */
const day = (offset: number): string =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** The day `days` after `from` (YYYY-MM-DD). */
const daysAfter = (from: string, days: number): string =>
    new Date(Date.parse(`${from}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

// These tests go through the route, whose clock is the real one, so each
// keeps days away from the edge of a state: a UTC midnight between a test's
// own reading of the date and the server's cannot change its result. The
// edges themselves (the last day a statement stands, the day after) are in
// warrant-canary.integration.test.ts, on a fixed clock.

const fetchCanary = async (): Promise<Record<string, any>> => {
    const user = makeUser(`canary_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/canary', auth(user.token));
    assert.equal(res.status, 200);
    return (await res.json()) as Record<string, any>;
};

// Until 2026-11-16 the route wrote the statement itself on every request and
// dated it to the current month, so a server nobody had touched for a year
// still said "no secret orders" as of today. The first test here is that
// case: with nothing set by the operator, there is no statement at all.
test('GET /v1/transparency/canary makes no statement of its own: with no issue date set, none has been issued', async (t) => {
    canaryEnv(t, { BLACKOUT_CANARY_ISSUED_ON: undefined, BLACKOUT_CANARY_VALID_DAYS: undefined });
    const body = await fetchCanary();
    assert.equal(body.status, 'not_issued');
    assert.equal(body.reason, 'no_date');
    assert.equal(body.statement, null, 'no affirmation is made');
    assert.equal(body.issuedOn, null);
    assert.equal(body.validUntil, null);
    assert.equal(body.digest, null);
    assert.equal(body.signature, null, 'and nothing is signed');
    assert.equal(body.publicKey, null);
    assert.match(body.detail, /No warrant canary has been issued for this server/);
    // The fields of the self-renewing version are gone.
    for (const gone of ['periodStart', 'periodEnd', 'generatedAt']) {
        assert.equal(gone in body, false, `${gone} is not in the response`);
    }
});

test("GET /v1/transparency/canary serves the statement the operator issued, with their date and not today's, and a digest that does not change from one request to the next", async (t) => {
    const issuedOn = day(-10);
    canaryEnv(t, { BLACKOUT_CANARY_ISSUED_ON: issuedOn, BLACKOUT_CANARY_VALID_DAYS: undefined });
    const body = await fetchCanary();
    assert.equal(body.status, 'current');
    assert.equal(body.issuedOn, issuedOn);
    assert.equal(
        body.validUntil,
        daysAfter(issuedOn, 35),
        '35 days from the issue date by default'
    );
    assert.ok(body.statement.startsWith(`As of ${issuedOn}, Blackout has not received`));
    assert.equal(
        new RegExp(`As of (?!${issuedOn})`).test(body.statement),
        false,
        'no other date is in it'
    );
    assert.equal(body.digestAlgorithm, 'sha256');
    assert.match(body.digest, /^[0-9a-f]{64}$/);
    assert.match(body.detail, new RegExp(`made this statement on ${issuedOn}`));

    const again = await fetchCanary();
    assert.equal(again.digest, body.digest);
    assert.equal(again.statement, body.statement);
});

test('GET /v1/transparency/canary reports a statement the operator has not renewed as lapsed, with the dates it had', async (t) => {
    const issuedOn = day(-60);
    canaryEnv(t, { BLACKOUT_CANARY_ISSUED_ON: issuedOn, BLACKOUT_CANARY_VALID_DAYS: undefined });
    const body = await fetchCanary();
    assert.equal(body.status, 'lapsed');
    assert.equal(body.issuedOn, issuedOn);
    assert.equal(body.validUntil, daysAfter(issuedOn, 35));
    assert.ok(body.statement.startsWith(`As of ${issuedOn},`), 'the old statement, not a new one');
    assert.match(body.detail, /has not renewed it; it lapsed after/);
});

test('GET /v1/transparency/canary: BLACKOUT_CANARY_VALID_DAYS sets how long a statement stands', async (t) => {
    const issuedOn = day(-20);
    canaryEnv(t, { BLACKOUT_CANARY_ISSUED_ON: issuedOn, BLACKOUT_CANARY_VALID_DAYS: '7' });
    const short = await fetchCanary();
    assert.equal(short.status, 'lapsed', 'twenty days into a seven-day statement');
    assert.equal(short.validUntil, daysAfter(issuedOn, 7));

    process.env.BLACKOUT_CANARY_VALID_DAYS = '90';
    const long = await fetchCanary();
    assert.equal(long.status, 'current');
    assert.equal(long.validUntil, daysAfter(issuedOn, 90));
});

test('GET /v1/transparency/canary treats an issue date that is not a date, or has not come, as no statement', async (t) => {
    canaryEnv(t, { BLACKOUT_CANARY_ISSUED_ON: undefined, BLACKOUT_CANARY_VALID_DAYS: undefined });
    for (const [value, reason] of [
        ['yesterday', 'invalid_date'],
        ['2026-02-31', 'invalid_date'],
        ['2026-11-16T00:00:00Z', 'invalid_date'],
        ['16/11/2026', 'invalid_date'],
        [day(3), 'future_date'],
    ] as const) {
        process.env.BLACKOUT_CANARY_ISSUED_ON = value;
        const body = await fetchCanary();
        assert.equal(body.status, 'not_issued', value);
        assert.equal(body.reason, reason, value);
        assert.equal(body.statement, null, value);
        assert.equal(body.signature, null, value);
    }
});

test('GET /v1/transparency/canary signs an issued statement with its dates, and the signature verifies against the returned key', async (t) => {
    const { verify } = await import('node:crypto');
    const { createPublicKey } = await import('node:crypto');
    canaryEnv(t, { BLACKOUT_CANARY_ISSUED_ON: day(-3), BLACKOUT_CANARY_VALID_DAYS: undefined });
    const body = await fetchCanary();

    assert.equal(body.signatureAlgorithm, 'ed25519');
    // In the test env an ephemeral key signs the canary.
    assert.equal(body.signatureKeySource, 'ephemeral');
    assert.ok(typeof body.signature === 'string' && body.signature.length > 0);
    assert.ok(typeof body.publicKey === 'string' && body.publicKey.length > 0);

    const canonical = `${body.statement}|${body.issuedOn}|${body.validUntil}`;
    const publicKey = createPublicKey({
        key: Buffer.from(body.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
    });
    const ok = verify(
        null,
        Buffer.from(canonical, 'utf8'),
        publicKey,
        Buffer.from(body.signature, 'base64')
    );
    assert.equal(ok, true);

    // A tampered statement must fail verification.
    const bad = verify(
        null,
        Buffer.from(`${canonical} TAMPERED`, 'utf8'),
        publicKey,
        Buffer.from(body.signature, 'base64')
    );
    assert.equal(bad, false);
    // So must the same statement with a later last day: the dates are signed.
    const extended = verify(
        null,
        Buffer.from(`${body.statement}|${body.issuedOn}|${day(400)}`, 'utf8'),
        publicKey,
        Buffer.from(body.signature, 'base64')
    );
    assert.equal(extended, false);
});

test('GET /v1/transparency/audit-export returns 402 for an unentitled (free) caller', async () => {
    const user = makeUser(`noexport_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/audit-export', auth(user.token));
    assert.equal(res.status, 402);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.code, 'audit_export_not_entitled');
    assert.equal(body.suggestedTier, 'team');
});

test('GET /v1/transparency/audit-export returns the export for an entitled caller', async () => {
    const user = makeAuditEntitledUser(`export_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/audit-export', auth(user.token));
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.schema, 'blackout.transparency.audit-export.v1');
    assert.equal(body.userId, user.id);
    assert.equal(body.entitlements.auditExport, true);
    assert.ok(Array.isArray(body.burnerIdentities));
});
