import test from 'node:test';
import assert from 'node:assert/strict';

const load = async () => import('../src/services/diagnosticsRedaction');

test('redactString scrubs emails, JWTs, bearers, hex secrets, and qs params', async () => {
  const { redactString } = await load();
  const input = [
    'Contact me at alice@example.com for details.',
    'Authorization: Bearer abcdef0123456789abcdef0123456789',
    'JWT: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    'API call: https://api.example/?password=hunter2&id=1',
    'Hash: deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'Matrix: syt_AbCdEfGhIjKlMnOpQrStUvWxYz',
  ].join('\n');

  const out = redactString(input);
  assert.ok(!/alice@example\.com/.test(out), 'email leaked');
  assert.ok(!/Bearer abcdef/.test(out), 'bearer leaked');
  assert.ok(!/eyJhbGciOiJIUzI1NiJ9/.test(out), 'jwt leaked');
  assert.ok(/password=\[redacted\]/.test(out), 'qs not redacted');
  assert.ok(!/deadbeefdeadbeef/.test(out), 'hex secret leaked');
  assert.ok(!/syt_AbCdEfGhIj/.test(out), 'matrix token leaked');
});

test('redactIssueReport truncates long fields and applies redaction recursively', async () => {
  const { redactIssueReport } = await load();
  const longDescription = 'a'.repeat(20_000) + ' contact alice@example.com';
  const result = redactIssueReport({
    description: longDescription,
    url: 'https://app/?token=abc&q=1 alice@example.com',
    userAgent: 'b'.repeat(2_000),
    appVersion: '4.10.5',
    buildChannel: 'stable',
    lastError: 'TypeError: foo at https://app/?password=secret\nat alice@example.com',
    featureFlags: { shellAppShell: true },
  });
  assert.ok(result.description.length <= 20_000, 'description not truncated');
  assert.ok(/\[truncated\]/.test(result.description), 'truncation marker missing');
  assert.ok(!/alice@example\.com/.test(result.description), 'email leaked in description');
  assert.ok(!/alice@example\.com/.test(result.url ?? ''), 'email leaked in url');
  assert.ok(/token=\[redacted\]/.test(result.url ?? ''), 'qs token not redacted');
  assert.ok(result.userAgent && result.userAgent.length <= 600, 'userAgent not truncated');
  assert.equal(result.appVersion, '4.10.5');
  assert.equal(result.buildChannel, 'stable');
  assert.ok(!/alice@example\.com/.test(result.lastError ?? ''), 'email leaked in lastError');
  assert.ok(/password=\[redacted\]/.test(result.lastError ?? ''), 'lastError qs not redacted');
  assert.deepEqual(result.featureFlags, { shellAppShell: true });
});
