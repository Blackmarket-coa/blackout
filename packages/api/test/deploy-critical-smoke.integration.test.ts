import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

// Production-shape end-to-end: register → confirm email → login →
// checkout → marketplace webhook → user-scoped entitlement read.
// Mirrors the deploy-critical smoke scope called out in
// docs/ai-prompts-remaining-work.md prompt 3 (auth bootstrap, media not
// covered here because it has its own coverage, marketplace + entitlement
// because they are the recently-wired surfaces most at risk in production).

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = '0';
// Force the real (non-stub) Freeblackmarket provider so the smoke
// exercises HMAC verification end-to-end.
delete process.env.FREEBLACKMARKET_STUB;
process.env.FREEBLACKMARKET_ENABLED = 'true';
process.env.FREEBLACKMARKET_API_KEY = 'smoke-test-api-key';
const WEBHOOK_SECRET = 'fbm-smoke-test-secret';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { default: app } = await import('../src/index');
const mailerModule = await import('../src/services/mailer');
const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');
const { resetMarketplaceEntitlementsForTest } = await import('../src/services/marketplaceEntitlements');
const { db } = await import('../src/db/store');

interface OutboxMessage {
  to: string;
  subject: string;
  text: string;
  kind?: string;
}

class CapturingMailer {
  outbox: OutboxMessage[] = [];
  async send(message: OutboxMessage) {
    this.outbox.push(message);
  }
}

const mailer = new CapturingMailer();
mailerModule.setMailer(mailer);

const sign = (rawBody: string): string =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

test('deploy-critical smoke: register → verify → login → checkout → webhook → entitlement', async () => {
  resetMarketplaceEntitlementsForTest();
  resetMarketplaceRegistry();
  mailer.outbox.length = 0;

  const suffix = crypto.randomBytes(4).toString('hex');
  const email = `smoke-${suffix}@example.com`;
  const username = `smoke-${suffix}`;
  const password = 'A-Strong-Pass-9876!';

  // 1. Register.
  const registerResp = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  assert.equal(registerResp.status, 201);
  const registerJson = (await registerResp.json()) as {
    token: string;
    userId: string;
    emailVerificationSent: boolean;
  };
  assert.equal(registerJson.emailVerificationSent, true);

  // 2. Confirm email.
  const verificationMail = mailer.outbox.find(
    (m) => m.to === email && m.kind === 'email_verification',
  );
  assert.ok(verificationMail, 'expected a verification email in the outbox');
  const tokenMatch = verificationMail!.text.match(/token=([^&"\s]+)/);
  assert.ok(tokenMatch, `verification body did not contain a token link: ${verificationMail!.text}`);
  const verificationToken = decodeURIComponent(tokenMatch![1]);
  const confirmResp = await app.request('/v1/auth/email/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(confirmResp.status, 200);
  const user = db.getUserById(registerJson.userId)!;
  assert.ok(user.emailVerifiedAt);

  // 3. Login (independent path from registration's session).
  const loginResp = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginResp.status, 200);
  const loginJson = (await loginResp.json()) as { token: string; userId: string };
  assert.equal(loginJson.userId, registerJson.userId);

  // 4. Fire a webhook directly (the upstream marketplace would POST this
  // after the user finishes checkout in their hosted UI). Validating the
  // checkout-session endpoint requires a live freeblackmarket instance,
  // so the smoke covers what we own: webhook signature + entitlement grant.
  const eventPayload = {
    providerId: 'freeblackmarket',
    eventId: `evt_${crypto.randomUUID()}`,
    type: 'purchase.succeeded',
    userId: registerJson.userId,
    providerListingId: 'smoke-listing-001',
    sku: null,
    kind: 'asset_bundle',
    occurredAt: new Date().toISOString(),
    metadata: {},
  };
  const rawWebhook = JSON.stringify(eventPayload);
  const webhookResp = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fbm-signature': sign(rawWebhook),
      'x-fbm-event-id': eventPayload.eventId,
    },
    body: rawWebhook,
  });
  assert.equal(webhookResp.status, 200);
  const webhookJson = (await webhookResp.json()) as {
    ok: boolean;
    entitlementId?: string;
    alreadyProcessed?: boolean;
  };
  assert.equal(webhookJson.ok, true);
  assert.ok(webhookJson.entitlementId);
  assert.equal(webhookJson.alreadyProcessed, false);

  // 5. The user can read their entitlement back via the authed list endpoint.
  const entitlementsResp = await app.request('/v1/marketplace/entitlements', {
    headers: { authorization: `Bearer ${loginJson.token}` },
  });
  assert.equal(entitlementsResp.status, 200);
  const entitlementsJson = (await entitlementsResp.json()) as {
    entitlements: Array<{ providerListingId: string; status: string }>;
  };
  assert.equal(entitlementsJson.entitlements.length, 1);
  assert.equal(entitlementsJson.entitlements[0]?.providerListingId, 'smoke-listing-001');
  assert.equal(entitlementsJson.entitlements[0]?.status, 'granted');

  // 6. Replaying the webhook does NOT double-grant.
  const replay = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fbm-signature': sign(rawWebhook),
      'x-fbm-event-id': eventPayload.eventId,
    },
    body: rawWebhook,
  });
  assert.equal(replay.status, 200);
  const replayJson = (await replay.json()) as { entitlementId: string; alreadyProcessed: boolean };
  assert.equal(replayJson.alreadyProcessed, true);
  assert.equal(replayJson.entitlementId, webhookJson.entitlementId);

  const entitlementsAfterReplay = await app.request('/v1/marketplace/entitlements', {
    headers: { authorization: `Bearer ${loginJson.token}` },
  });
  const replayList = (await entitlementsAfterReplay.json()) as { entitlements: unknown[] };
  assert.equal(replayList.entitlements.length, 1, 'replayed webhook must not double-grant');
});

test('deploy-critical smoke: confirming with an invalid token returns 400', async () => {
  const resp = await app.request('/v1/auth/email/verify/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token' }),
  });
  assert.equal(resp.status, 400);
});

test('deploy-critical smoke: login with wrong password returns 401', async () => {
  const suffix = crypto.randomBytes(4).toString('hex');
  const email = `smoke-wrong-${suffix}@example.com`;
  const username = `wrong-${suffix}`;
  const register = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password: 'A-Strong-Pass-9876!' }),
  });
  assert.equal(register.status, 201);

  const wrong = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'definitely-wrong-pass' }),
  });
  assert.equal(wrong.status, 401);
});
