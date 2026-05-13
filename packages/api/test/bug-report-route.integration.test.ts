import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { setDefaultRateLimitStore } from '../src/middleware/rate-limit';

// The rate-limit middleware closure-caches the store reference on first
// invocation. Install one shared in-memory store before any test loads the
// route module, then clear its state between tests. This keeps the closure
// pointing at our test store for the whole file.
const rateLimitState = new Map<string, number[]>();
before(() => {
  setDefaultRateLimitStore({
    async hit(key, windowMs) {
      const now = Date.now();
      const history = (rateLimitState.get(key) ?? []).filter((ts) => now - ts < windowMs);
      history.push(now);
      rateLimitState.set(key, history);
      return history.length;
    },
  });
});
beforeEach(() => {
  rateLimitState.clear();
});
after(() => {
  setDefaultRateLimitStore(null);
});

// Imported after `before` registers the store, but Node runs `before` before
// any test executes — and the middleware doesn't resolve its store until the
// first request, so import order here is safe.
const { default: bugReport } = await import('../src/routes/bugReport');

const buildApp = () => {
  const app = new Hono();
  app.route('/bug-report', bugReport);
  return app;
};

const validBody = {
  title: 'voice cuts out',
  description: 'When I join a voice room my mic stops working',
  category: 'voice',
  severity: 'medium',
  includeDiagnostics: false,
  includeMatrixIdHash: false,
} as const;

const post = (app: Hono, body: unknown) =>
  app.request('/bug-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
    body: JSON.stringify(body),
  });

const withCleanEnv = async (fn: () => Promise<void>) => {
  const previous = { ...process.env };
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_BUG_REPORT_PAT;
  delete process.env.RAGESHAKE_ENDPOINT_URL;
  try {
    await fn();
  } finally {
    Object.assign(process.env, previous);
  }
};

test('happy path: dev no-op accepts the request and returns 200 with synthetic URL', async () => {
  await withCleanEnv(async () => {
    const res = await post(buildApp(), validBody);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.issueUrl, 'https://github.example/dev-no-op/0');
    assert.equal(body.partial, false);
  });
});

test('invalid body returns 400 with zod issues', async () => {
  const res = await post(buildApp(), { title: 'no', description: 'too short' });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; details?: { issues: unknown[] } };
  assert.equal(body.code, 'invalid_request');
  assert.ok((body.details?.issues ?? []).length > 0);
});

test('rate limit: sixth request from the same IP in one hour returns 429', async () => {
  // Default BUG_REPORT_RATE_LIMIT_MAX is 5. We rely on it; setting an env
  // var here wouldn't help because the route module read it at import time.
  await withCleanEnv(async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i += 1) {
      const res = await post(app, validBody);
      assert.equal(res.status, 200, `request ${i + 1} expected 200, got ${res.status}`);
    }
    const sixth = await post(app, validBody);
    assert.equal(sixth.status, 429);
    assert.ok(sixth.headers.get('retry-after'));
  });
});
