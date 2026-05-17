import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.BLACKOUT_DB_MODE = 'memory';
// 0 cooldown so cooldown-specific test can set it explicitly without
// affecting the happy-path tests.
process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = '0';

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const mailerModule = await import('../src/services/mailer');
const verificationModule = await import('../src/services/emailVerification');

class InMemoryMailer {
  outbox: Array<{ to: string; subject: string; text: string; kind?: string }> = [];
  shouldFail = false;
  async send(message: { to: string; subject: string; text: string; kind?: string }) {
    if (this.shouldFail) throw new Error('boom');
    this.outbox.push(message);
  }
}

const mailer = new InMemoryMailer();
mailerModule.setMailer(mailer);

const TOKEN_PATTERN = /token=([^&"\s]+)/;

const registerUser = async (suffix: string) => {
  const email = `verify-${suffix}@example.com`;
  const username = `verify-${suffix}`;
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password: 'A-Strong-Pass-9876!' }),
  });
  if (response.status !== 201) {
    throw new Error(`register expected 201, got ${response.status}: ${await response.text()}`);
  }
  const json = (await response.json()) as { userId: string; token: string; emailVerificationSent: boolean };
  return { ...json, email, username };
};

const extractTokenFromLatestMail = (recipient: string): string => {
  const found = [...mailer.outbox].reverse().find((m) => m.to === recipient);
  assert.ok(found, 'expected an email for recipient');
  const match = found!.text.match(TOKEN_PATTERN);
  assert.ok(match, `expected verification link in email body, got: ${found!.text}`);
  return decodeURIComponent(match![1]);
};

test('registration fires a verification email and confirm marks the user verified', async () => {
  mailer.outbox.length = 0;
  mailer.shouldFail = false;
  const user = await registerUser('happy');
  assert.equal(user.emailVerificationSent, true);

  // Mail dispatched with the expected kind tag.
  const mailed = mailer.outbox.find((m) => m.to === user.email);
  assert.ok(mailed, 'expected verification email');
  assert.equal(mailed!.kind, 'email_verification');

  // User starts unverified.
  const before = db.getUserById(user.userId);
  assert.equal(before?.emailVerifiedAt, undefined);

  // Confirm the verification.
  const token = extractTokenFromLatestMail(user.email);
  const confirm = await app.request('/v1/auth/email/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (confirm.status !== 200) {
    throw new Error(`confirm expected 200, got ${confirm.status}: ${await confirm.text()}`);
  }
  const confirmJson = (await confirm.json()) as { ok: boolean; userId: string; emailVerifiedAt: string };
  assert.equal(confirmJson.ok, true);
  assert.equal(confirmJson.userId, user.userId);
  assert.ok(confirmJson.emailVerifiedAt);

  // Replaying the same token is rejected.
  const replay = await app.request('/v1/auth/email/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  assert.equal(replay.status, 410);
  const replayJson = (await replay.json()) as { code: string };
  assert.equal(replayJson.code, 'token_consumed');
});

test('verify/request issues a new token, retires the old one, and 429s under cooldown', async () => {
  mailer.outbox.length = 0;
  const user = await registerUser('resend');
  const oldToken = extractTokenFromLatestMail(user.email);

  // Resend without cooldown gives a brand-new token; the original is revoked.
  const resend = await app.request('/v1/auth/email/verify/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify({}),
  });
  if (resend.status !== 200) {
    throw new Error(`resend expected 200, got ${resend.status}: ${await resend.text()}`);
  }
  const replayOld = await app.request('/v1/auth/email/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: oldToken }),
  });
  assert.equal(replayOld.status, 410);
  const replayOldJson = (await replayOld.json()) as { code: string };
  assert.equal(replayOldJson.code, 'token_revoked');

  // Now set cooldown and call request again — should 429.
  process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = '60';
  try {
    const cooldown = await app.request('/v1/auth/email/verify/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(cooldown.status, 429);
    assert.ok(cooldown.headers.get('retry-after'));
  } finally {
    process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = '0';
  }
});

test('verify/request rejects a mismatched email', async () => {
  mailer.outbox.length = 0;
  const user = await registerUser('mismatch');
  const response = await app.request('/v1/auth/email/verify/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify({ email: 'attacker@example.com' }),
  });
  assert.equal(response.status, 400);
  const json = (await response.json()) as { code: string };
  assert.equal(json.code, 'email_mismatch');
});

test('verify/confirm returns email_changed if the email was updated after issue', async () => {
  mailer.outbox.length = 0;
  const user = await registerUser('changed');
  const token = extractTokenFromLatestMail(user.email);

  // Simulate an email change at the record level (admin tooling).
  const before = db.getUserById(user.userId)!;
  db.users.set(before.id, { ...before, email: 'new@example.com' });

  const confirm = await app.request('/v1/auth/email/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  assert.equal(confirm.status, 410);
  const json = (await confirm.json()) as { code: string };
  assert.equal(json.code, 'email_changed');
});

test('issueEmailVerificationToken short-circuits for already-verified users', () => {
  // Use a fresh user we mark as verified out-of-band.
  const id = 'short-circuit-user';
  db.users.set(id, {
    id,
    username: 'verified',
    email: 'verified@example.com',
    passwordHash: 'x',
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
    createdAt: new Date().toISOString(),
    emailVerifiedAt: new Date().toISOString(),
  });
  const result = verificationModule.issueEmailVerificationToken({
    userId: id,
    email: 'verified@example.com',
  });
  assert.equal(result.kind, 'already_verified');
});

test('verify/request returns 502 when the mailer is failing', async () => {
  mailer.outbox.length = 0;
  const user = await registerUser('failmail');
  mailer.shouldFail = true;
  try {
    const response = await app.request('/v1/auth/email/verify/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 502);
  } finally {
    mailer.shouldFail = false;
  }
});
