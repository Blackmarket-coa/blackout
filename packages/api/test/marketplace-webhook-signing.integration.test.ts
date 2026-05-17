import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.BLACKOUT_DB_MODE = 'memory';
// Force the *real* (non-stub) Freeblackmarket provider so we exercise
// HMAC verification, replay protection, and refund handling against the
// production-shape signing pipeline. The stub variant has its own coverage.
delete process.env.FREEBLACKMARKET_STUB;
process.env.FREEBLACKMARKET_ENABLED = 'true';
process.env.FREEBLACKMARKET_API_KEY = 'test-api-key-not-used-here';
const WEBHOOK_SECRET = 'fbm-integration-test-secret';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { default: app } = await import('../src/index');
const {
  listEntitlementsForUser,
  resetMarketplaceEntitlementsForTest,
} = await import('../src/services/marketplaceEntitlements');
const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');

const sign = (rawBody: string): string =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

const buildEvent = (overrides: Partial<Record<string, unknown>> = {}) => ({
  providerId: 'freeblackmarket',
  eventId: `evt_${crypto.randomUUID()}`,
  type: 'purchase.succeeded',
  userId: `user_${crypto.randomBytes(4).toString('hex')}`,
  providerListingId: 'listing-abc',
  sku: null,
  kind: 'asset_bundle',
  occurredAt: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

const postWebhook = async (
  payload: Record<string, unknown>,
  options: { sign?: boolean; eventIdHeader?: boolean; corruptSignature?: boolean } = {},
) => {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.sign !== false) {
    headers['x-fbm-signature'] = options.corruptSignature
      ? 'a'.repeat(64)
      : sign(body);
  }
  if (options.eventIdHeader !== false && typeof payload.eventId === 'string') {
    headers['x-fbm-event-id'] = payload.eventId as string;
  }
  return app.request('/v1/marketplace/webhooks/freeblackmarket', {
    method: 'POST',
    headers,
    body,
  });
};

const resetAll = () => {
  resetMarketplaceEntitlementsForTest();
  resetMarketplaceRegistry();
};

test('webhook with a valid signature grants an entitlement', async () => {
  resetAll();
  const event = buildEvent({ kind: 'asset_bundle' });
  const response = await postWebhook(event);
  assert.equal(response.status, 200);
  const json = (await response.json()) as { ok: boolean; entitlementId?: string };
  assert.equal(json.ok, true);
  assert.ok(json.entitlementId);
  const entitlements = listEntitlementsForUser(event.userId as string);
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0]!.status, 'granted');
});

test('webhook with a missing signature is rejected as unauthorized', async () => {
  resetAll();
  const event = buildEvent();
  const response = await postWebhook(event, { sign: false });
  assert.equal(response.status, 401);
});

test('webhook with a forged signature is rejected as unauthorized', async () => {
  resetAll();
  const event = buildEvent();
  const response = await postWebhook(event, { corruptSignature: true });
  assert.equal(response.status, 401);
  const entitlements = listEntitlementsForUser(event.userId as string);
  assert.equal(entitlements.length, 0);
});

test('replaying a webhook yields the same entitlement and is idempotent', async () => {
  resetAll();
  const event = buildEvent({ kind: 'asset_bundle' });
  const first = await postWebhook(event);
  assert.equal(first.status, 200);
  const firstJson = (await first.json()) as { entitlementId: string; alreadyProcessed: boolean };
  assert.equal(firstJson.alreadyProcessed, false);

  const replay = await postWebhook(event);
  assert.equal(replay.status, 200);
  const replayJson = (await replay.json()) as { entitlementId: string; alreadyProcessed: boolean };
  assert.equal(replayJson.alreadyProcessed, true);
  assert.equal(replayJson.entitlementId, firstJson.entitlementId);

  // Replay must NOT double-grant.
  const entitlements = listEntitlementsForUser(event.userId as string);
  assert.equal(entitlements.length, 1);
});

test('refund event flips the entitlement status without creating a new row', async () => {
  resetAll();
  const userId = `user_${crypto.randomBytes(4).toString('hex')}`;
  const purchase = buildEvent({ userId, kind: 'asset_bundle' });
  const purchaseResp = await postWebhook(purchase);
  assert.equal(purchaseResp.status, 200);

  const refund = buildEvent({
    userId,
    type: 'purchase.refunded',
    providerListingId: purchase.providerListingId,
    kind: 'asset_bundle',
  });
  const refundResp = await postWebhook(refund);
  assert.equal(refundResp.status, 200);

  const entitlements = listEntitlementsForUser(userId);
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0]!.status, 'refunded');
});

test('chargeback event flips the entitlement status to chargebacked', async () => {
  resetAll();
  const userId = `user_${crypto.randomBytes(4).toString('hex')}`;
  const purchase = buildEvent({ userId, kind: 'asset_bundle' });
  await postWebhook(purchase);

  const chargeback = buildEvent({
    userId,
    type: 'purchase.chargebacked',
    providerListingId: purchase.providerListingId,
    kind: 'asset_bundle',
  });
  const response = await postWebhook(chargeback);
  assert.equal(response.status, 200);

  const entitlements = listEntitlementsForUser(userId);
  assert.equal(entitlements[0]!.status, 'chargebacked');
});

test('malformed payload (valid signature, missing required fields) is rejected as bad request', async () => {
  resetAll();
  const payload = { not: 'a real event' };
  const response = await postWebhook(payload as Record<string, unknown>, {
    eventIdHeader: false,
  });
  assert.equal(response.status, 400);
  const json = (await response.json()) as { reason?: string };
  assert.equal(json.reason, 'invalid-event-payload');
});

test('unknown provider id is rejected with 400', async () => {
  resetAll();
  const event = buildEvent();
  const body = JSON.stringify(event);
  const response = await app.request('/v1/marketplace/webhooks/not-a-real-provider', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fbm-signature': sign(body),
      'x-fbm-event-id': event.eventId as string,
    },
    body,
  });
  assert.equal(response.status, 400);
});
