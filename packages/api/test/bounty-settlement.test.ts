/**
 * Unit tests for the FBM bounty-settlement bridge stub. FBM is a separate repo,
 * so these exercise the config gating + request/response shaping in isolation
 * with an injected fetch — no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { BountyReward } from '@blackout/core';
import { settleBountyRewardViaFbm } from '../src/integrations/fbm/bountySettlement';

const reward = (over: Partial<BountyReward> = {}): BountyReward => ({
  id: 'r1',
  bountyId: 'b1',
  beneficiaryId: '@alice:bmc',
  posterId: '@poster:bmc',
  rewardType: 'cash',
  rewardSummary: '$50',
  rewardCents: 5000,
  status: 'earned',
  earnedAt: '2026-06-03T00:00:00.000Z',
  settledAt: null,
  settledRef: null,
  ...over,
});

const okFetch = (settlementId: unknown): typeof fetch =>
  (async () =>
    new Response(JSON.stringify({ settlementId }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

test('no-op (null) when FBM is not configured', async () => {
  delete process.env.FREEBLACKMARKET_API_KEY;
  const calls: unknown[] = [];
  const spyFetch = (async (...a: unknown[]) => {
    calls.push(a);
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const res = await settleBountyRewardViaFbm(reward(), spyFetch);
  assert.equal(res, null);
  assert.equal(calls.length, 0, 'must not call FBM when unconfigured');
});

test('no settlement for a non-monetary reward', async () => {
  process.env.FREEBLACKMARKET_API_KEY = 'k';
  const res = await settleBountyRewardViaFbm(reward({ rewardCents: null }), okFetch('s_1'));
  assert.equal(res, null);
});

test('settles and returns the payout reference when configured', async () => {
  process.env.FREEBLACKMARKET_API_KEY = 'k';
  process.env.FREEBLACKMARKET_ENABLED = 'true';
  const res = await settleBountyRewardViaFbm(reward(), okFetch('s_123'));
  assert.deepEqual(res, { settledRef: 'fbm:s_123' });
});

test('null when FBM responds non-ok', async () => {
  process.env.FREEBLACKMARKET_API_KEY = 'k';
  const failFetch = (async () => new Response('err', { status: 500 })) as unknown as typeof fetch;
  const res = await settleBountyRewardViaFbm(reward(), failFetch);
  assert.equal(res, null);
});

test('null when FBM omits a settlementId', async () => {
  process.env.FREEBLACKMARKET_API_KEY = 'k';
  const res = await settleBountyRewardViaFbm(reward(), okFetch(undefined));
  assert.equal(res, null);
});
