import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { securityHeaders, __test__ } from '../src/middleware/security-headers';

const buildApp = (opts?: Parameters<typeof securityHeaders>[0]) => {
  const app = new Hono();
  app.use('*', securityHeaders(opts));
  app.get('/x', (c) => c.text('ok'));
  return app;
};

test('emits a strict CSP with frame-ancestors none and default-src none', async () => {
  const res = await buildApp().request('/x');
  const csp = res.headers.get('Content-Security-Policy') ?? '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
});

test('connect-src and media-src honor extra hosts', async () => {
  const res = await buildApp({
    connectSrc: ['https://api.example.com', 'wss://matrix.example.com'],
    mediaSrc: ['https://livekit.example.com'],
  }).request('/x');
  const csp = res.headers.get('Content-Security-Policy') ?? '';
  assert.match(csp, /connect-src 'self' https:\/\/api\.example\.com wss:\/\/matrix\.example\.com/);
  assert.match(csp, /media-src 'self' blob: https:\/\/livekit\.example\.com/);
});

test('report-only mode uses the report-only header', async () => {
  const res = await buildApp({ reportOnly: true }).request('/x');
  assert.equal(res.headers.get('Content-Security-Policy'), null);
  assert.ok(res.headers.get('Content-Security-Policy-Report-Only'));
});

test('emits the standard hardening headers', async () => {
  const res = await buildApp({ hsts: true }).request('/x');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
  assert.equal(res.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.match(res.headers.get('Permissions-Policy') ?? '', /camera=\(self\)/);
  assert.match(
    res.headers.get('Strict-Transport-Security') ?? '',
    /max-age=63072000; includeSubDomains; preload/,
  );
});

test('omits HSTS when disabled (non-production default)', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const res = await buildApp().request('/x');
    assert.equal(res.headers.get('Strict-Transport-Security'), null);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('CSP builder includes a report-uri when configured', () => {
  const csp = __test__.buildCsp({ reportUri: 'https://csp.example.com/report' });
  assert.match(csp, /report-uri https:\/\/csp\.example\.com\/report/);
});
