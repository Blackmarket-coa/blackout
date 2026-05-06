/**
 * End-to-end smoke tests against the exported Hono app.
 *
 * Boots the API in-process (no listener) and exercises the public surface
 * via app.fetch — the exact same dispatch path the @hono/node-server uses,
 * so handlers, middleware, CORS preflight, and metrics emission are all
 * covered without binding to a port.
 *
 * Run with: BLACKOUT_API_SKIP_LISTEN=1 NODE_ENV=test tsx --test test/smoke.integration.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTestJwtSecret, generateTestToken } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = '1';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
process.env.CORS_ALLOW_CREDENTIALS = 'true';
const SMOKE_METRICS_TOKEN = generateTestToken('smoke-metrics');
process.env.INTERNAL_METRICS_TOKEN = SMOKE_METRICS_TOKEN;

const loadApp = async () => (await import('../src/index')).default;

test('GET /health returns ok with expected shape', async () => {
  const app = await loadApp();
  const res = await app.fetch(new Request('http://localhost/health'));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.aliasRemovalDate, 'string');
  assert.ok(body.security);
});

test('GET /metrics requires the internal token in non-public mode', async () => {
  const app = await loadApp();
  const res = await app.fetch(new Request('http://localhost/metrics'));
  assert.equal(res.status, 401);
});

test('GET /metrics returns Prometheus exposition with the right token', async () => {
  const app = await loadApp();
  const res = await app.fetch(
    new Request('http://localhost/metrics', {
      headers: { authorization: `Bearer ${SMOKE_METRICS_TOKEN}` },
    }),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
  const body = await res.text();
  assert.match(body, /# TYPE http_request_duration_seconds histogram/);
  assert.match(body, /# TYPE http_requests_total counter/);
});

test('CORS preflight is rejected for unknown origins', async () => {
  const app = await loadApp();
  const res = await app.fetch(
    new Request('http://localhost/v1/auth/login', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example.com',
        'access-control-request-method': 'POST',
      },
    }),
  );
  // Hono's cors() returns no Access-Control-Allow-Origin when the callback
  // returns null. Our test asserts the absence of the allow header rather
  // than a specific status, since browsers will block the request either
  // way; some Hono versions return 204 even on a denied origin.
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('CORS preflight echoes the allowed origin for known origins', async () => {
  const app = await loadApp();
  const res = await app.fetch(
    new Request('http://localhost/v1/auth/login', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'POST',
      },
    }),
  );
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example.com');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('register → login → /metrics records http_requests_total', async () => {
  const app = await loadApp();

  const register = await app.fetch(
    new Request('http://localhost/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
      body: JSON.stringify({
        username: `smoke-${Date.now()}`,
        email: `smoke-${Date.now()}@example.com`,
        password: 'Sm0ke-Pass-Word-9999!',
      }),
    }),
  );
  assert.equal(register.status, 201);
  const registerBody = (await register.json()) as { token: string; refreshToken: string; userId: string };
  assert.ok(registerBody.token);
  assert.ok(registerBody.refreshToken);

  const metrics = await app.fetch(
    new Request('http://localhost/metrics', {
      headers: { authorization: `Bearer ${SMOKE_METRICS_TOKEN}` },
    }),
  );
  const metricsBody = await metrics.text();
  // The register route is mounted under both v1 and the legacy alias; we
  // only need to see that *some* labelled http_requests_total series for
  // POSTs exists.
  assert.match(metricsBody, /http_requests_total\{method="POST"/);
});

test('rate-limited endpoints return 429 after the configured threshold', async () => {
  // Reset env so this test gets its own bucket. We exercise the global
  // limiter by hammering /health which is unauthenticated and unrate-limited
  // at the route level — but the global rate limiter still applies. We
  // bypass that by using a fresh IP per request to pin the per-IP behaviour.
  const app = await loadApp();

  let lastStatus = 0;
  for (let i = 0; i < 12; i += 1) {
    const res = await app.fetch(
      new Request('http://localhost/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.99',
        },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' }),
      }),
    );
    lastStatus = res.status;
    if (res.status === 429) break;
  }
  assert.equal(lastStatus, 429, 'expected the 11th login attempt from a single IP to be rate-limited');
});
