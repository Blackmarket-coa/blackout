import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
// Force the bug-report pipeline into dev no-op mode so a valid report returns
// 200 without any external forwarder configured.
delete process.env.GITHUB_APP_ID;
delete process.env.GITHUB_BUG_REPORT_PAT;
delete process.env.RAGESHAKE_ENDPOINT_URL;

const { default: app } = await import('../src/index');

const validBugReport = {
  title: 'voice cuts out',
  description: 'When I join a voice room my mic stops working',
  category: 'voice',
  severity: 'medium',
  includeDiagnostics: false,
  includeMatrixIdHash: false,
} as const;

const postJson = (path: string, body: unknown, ip: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });

// Regression: /bug-report is mounted top-level, but deployment nginx only
// proxies /v1/* to the API, so the web client's POST fell through to the SPA
// static host and returned 405. The route is now mirrored under /v1.
test('POST /v1/bug-report reaches the handler (was 405 through the proxy)', async () => {
  const res = await postJson('/v1/bug-report', validBugReport, '198.51.100.10');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { partial: boolean };
  assert.equal(body.partial, false);
});

test('POST /v1/bug-report/widget reaches the handler (zod-validates the body)', async () => {
  // Empty body proves the route is mounted and method-allowed: it reaches zod
  // (400) rather than falling through to a 404/405.
  const res = await postJson('/v1/bug-report/widget', {}, '198.51.100.11');
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'invalid_request');
});

test('top-level POST /bug-report still works (native + backward compat)', async () => {
  const res = await postJson('/bug-report', validBugReport, '198.51.100.12');
  assert.equal(res.status, 200);
});
