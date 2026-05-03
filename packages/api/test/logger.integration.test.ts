import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, __test__ } from '../src/telemetry/logger';

test('redacts well-known secret field names', () => {
  const out = redact({
    authorization: 'Bearer abc',
    Cookie: 'sid=def',
    password: 'hunter2',
    refresh_token: 'r-12345',
    api_key: 'k-12345',
    benign: 'keep-me',
  });
  assert.equal(out.authorization, '[REDACTED]');
  assert.equal(out.Cookie, '[REDACTED]');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.refresh_token, '[REDACTED]');
  assert.equal(out.api_key, '[REDACTED]');
  assert.equal(out.benign, 'keep-me');
});

test('redacts JWT-looking values inside arbitrary string fields', () => {
  // Construct a JWT-shaped fixture at runtime so this file does not contain a
  // literal token and trip secret-scanners. The redactor only matches on shape
  // (header.payload.signature, base64url-ish, each segment >= 10 chars).
  const head = 'ey' + 'J' + 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const body = 'ey' + 'J' + 'zdWIiOiIxMjM0NTY3ODkwIn0';
  const sig = 'aaaaaaaaaaaaaaaaaaaa';
  const jwt = `${head}.${body}.${sig}`;
  const out = redact({ message: `error using token ${jwt} please` });
  assert.match(String(out.message), /\[REDACTED\]/);
  assert.doesNotMatch(String(out.message), new RegExp(`${head.slice(0, 4)}`));
});

test('PII fields are returned as-is in non-production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const out = redact({ email: 'a@b.com', ip: '1.2.3.4' });
    assert.equal(out.email, 'a@b.com');
    assert.equal(out.ip, '1.2.3.4');
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('PII and identifiers are pseudonymized in production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const a = redact({ email: 'a@b.com', matrix_id: '@alice:server', room_id: '!r:server' });
    const b = redact({ email: 'a@b.com', matrix_id: '@alice:server', room_id: '!r:server' });
    // deterministic — same input → same hashed output (so logs remain joinable)
    assert.equal(a.email, b.email);
    assert.equal(a.matrix_id, b.matrix_id);
    assert.match(String(a.email), /^h:/);
    assert.match(String(a.matrix_id), /^h:/);
    assert.notEqual(a.email, 'a@b.com');
    assert.notEqual(a.matrix_id, '@alice:server');
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('nested objects and arrays are walked', () => {
  const out = redact({
    request: { headers: { Authorization: 'Bearer x', 'X-Trace': 't' } },
    items: [{ password: 'p' }, { ok: 1 }],
  });
  const req = out.request as { headers: Record<string, unknown> };
  assert.equal(req.headers.Authorization, '[REDACTED]');
  assert.equal(req.headers['X-Trace'], 't');
  const items = out.items as Array<Record<string, unknown>>;
  assert.equal(items[0].password, '[REDACTED]');
  assert.equal(items[1].ok, 1);
});

test('pseudonymize is stable and short', () => {
  const a = __test__.pseudonymize('x');
  const b = __test__.pseudonymize('x');
  assert.equal(a, b);
  assert.match(a, /^h:[A-Za-z0-9_-]{16}$/);
});
