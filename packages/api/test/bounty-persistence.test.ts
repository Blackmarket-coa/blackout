/**
 * Persistence round-trip for bounties, applications, and the reward ledger.
 * Exercises the file-backed write-through store (the same snapshot/hydrate path
 * the Postgres store mirrors): mutate one instance, then hydrate a fresh one
 * from the same file and assert the data survived.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'bounty-persist-'));
process.env.BLACKOUT_DB_FILE = join(dir, 'store.json');
delete process.env.DATABASE_URL;

const { FileBackedDb } = await import('../src/db/store');

test('bounties, applications, and rewards persist across reloads', () => {
  const db1 = new FileBackedDb();
  db1.createBounty({
    id: 'b1',
    category: 'creator',
    title: 'Need a TikTok campaign',
    description: 'Make 3 short videos',
    creatorId: '@poster:bmc',
    rewardType: 'cash',
    rewardSummary: '$50',
    rewardAmountCents: 5000,
    requirements: ['portfolio'],
    deliverables: ['3 videos'],
  });
  db1.createBountyApplication({
    id: 'a1',
    bountyId: 'b1',
    applicantId: '@alice:bmc',
    message: 'I make food content',
  });
  db1.createBountyApplication({ id: 'a2', bountyId: 'b1', applicantId: '@bob:bmc' });
  const accepted = db1.acceptBountyApplication('b1', '@alice:bmc');
  assert.equal(accepted?.bounty.status, 'claimed');
  const reward = db1.recordBountyReward({
    bountyId: 'b1',
    beneficiaryId: '@alice:bmc',
    posterId: '@poster:bmc',
    rewardType: 'cash',
    rewardSummary: '$50',
    rewardCents: 5000,
  });
  assert.equal(reward.status, 'earned');
  db1.settleBountyReward('b1', { ref: 'fbm:s_123' });

  // A fresh instance hydrates from the same on-disk snapshot.
  const db2 = new FileBackedDb();

  const bounties = db2.listBounties({});
  assert.equal(bounties.length, 1);
  assert.equal(bounties[0].status, 'claimed');
  assert.equal(bounties[0].claimedBy, '@alice:bmc');
  assert.deepEqual(bounties[0].requirements, ['portfolio']);
  assert.deepEqual(bounties[0].deliverables, ['3 videos']);

  const apps = db2.listBountyApplications({ bountyId: 'b1' });
  assert.equal(apps.length, 2);
  assert.equal(apps.find((a) => a.applicantId === '@alice:bmc')?.status, 'accepted');
  assert.equal(apps.find((a) => a.applicantId === '@bob:bmc')?.status, 'declined');

  const rewards = db2.listBountyRewardsForBeneficiary('@alice:bmc');
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].status, 'settled');
  assert.equal(rewards[0].settledRef, 'fbm:s_123');
  assert.equal(db2.bountyRewardSummary('@alice:bmc').settledCents, 5000);
});
