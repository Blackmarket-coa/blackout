import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { setDefaultRateLimitStore } from '../src/middleware/rate-limit';

// Install a shared in-memory rate-limit store before the route module loads,
// then reset between tests (mirrors bug-report-route.integration.test.ts).
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

const { default: widgetReport } = await import('../src/routes/widgetReport');

const buildApp = () => {
  const app = new Hono();
  app.route('/bug-report/widget', widgetReport);
  return app;
};

const validBody = {
  description: 'The compose box freezes when I paste a screenshot',
  steps: '1. open a room\n2. paste an image',
  metadata: {
    clientVersion: '4.10.5',
    userAgent: 'Mozilla/5.0',
    platform: 'Linux',
    screenWidth: 1920,
    screenHeight: 1080,
  },
} as const;

const post = (app: Hono, body: unknown) =>
  app.request('/bug-report/widget', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
    body: JSON.stringify(body),
  });

// Clears both delivery sinks (Matrix + GitHub/rageshake) so the route exercises
// the dual dev-no-op path hermetically — no homeserver, no GitHub auth, no
// rageshake endpoint — and still returns 200.
const withNoMatrix = async (fn: () => Promise<void>) => {
  const previous = { ...process.env };
  delete process.env.MATRIX_HOMESERVER;
  delete process.env.MATRIX_HOMESERVER_URL;
  delete process.env.MATRIX_BOT_TOKEN;
  delete process.env.BUG_REPORT_MATRIX_ROOM_ID;
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_INSTALLATION_ID;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  delete process.env.GITHUB_BUG_REPORT_PAT;
  delete process.env.RAGESHAKE_ENDPOINT_URL;
  try {
    await fn();
  } finally {
    Object.assign(process.env, previous);
  }
};

test('happy path: dev no-op (matrix unconfigured) returns 200 ok', async () => {
  await withNoMatrix(async () => {
    const res = await post(buildApp(), validBody);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal(body.devNoop, true);
  });
});

test('invalid body returns 400 with zod issues', async () => {
  const res = await post(buildApp(), { description: 'short', metadata: {} });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; details?: { issues: unknown[] } };
  assert.equal(body.code, 'invalid_request');
  assert.ok((body.details?.issues ?? []).length > 0);
});

test('rate limit: sixth request from the same IP in one hour returns 429', async () => {
  await withNoMatrix(async () => {
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
