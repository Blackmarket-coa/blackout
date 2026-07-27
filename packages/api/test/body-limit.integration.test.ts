import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createHmac, randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS =
    process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS ?? `v1:${randomBytes(32).toString('base64')}`;

// ---------------------------------------------------------------------------
// Part A — per-webhook cap (route-level)
// ---------------------------------------------------------------------------

const PATREON_SECRET = 'patreon-test-secret';
const { buildPatreonWebhookRoute } = await import('../src/routes/patreonWebhook');
const patreonSign = (b: string) => createHmac('md5', PATREON_SECRET).update(b).digest('hex');
const patreonApp = () => {
    const a = new Hono();
    a.route(
        '/wh',
        buildPatreonWebhookRoute({ secretResolver: () => PATREON_SECRET, onEvent: () => {} })
    );
    return a;
};

test('webhook cap: oversized body → 413 (before the signature check)', async () => {
    const big = 'x'.repeat(256 * 1024 + 1024); // > 256 KiB
    const res = await patreonApp().request('/wh/', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-patreon-event': 'members:pledge:create',
            'x-patreon-signature': patreonSign(big),
        },
        body: big,
    });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).code, 'payload_too_large');
});

test('webhook cap: a normal signed body is not blocked (not 413)', async () => {
    const body = JSON.stringify({ data: {} });
    const res = await patreonApp().request('/wh/', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-patreon-event': 'members:pledge:create',
            'x-patreon-signature': patreonSign(body),
        },
        body,
    });
    assert.notEqual(res.status, 413);
});

// ---------------------------------------------------------------------------
// Part B — global cap (full app, unauthenticated /bug-report path)
// ---------------------------------------------------------------------------

const { default: fullApp } = await import('../src/index');

test('global cap: > 16 MiB body → 413 (before auth/handler)', async () => {
    const huge = 'y'.repeat(16 * 1024 * 1024 + 4096);
    const res = await fullApp.request('/bug-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
        body: huge,
    });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).code, 'payload_too_large');
});

test('global cap: a normal small body is not blocked by the cap (not 413)', async () => {
    const res = await fullApp.request('/bug-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.8' },
        body: JSON.stringify({
            title: 'a',
            description: 'short but valid enough',
            category: 'other',
            severity: 'low',
            includeDiagnostics: false,
            includeMatrixIdHash: false,
        }),
    });
    assert.notEqual(res.status, 413);
});
