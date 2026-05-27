import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import { db } from '../db/store';
import { getBalance, grantPoints, redeemReward } from '../services/channelPoints';
import type { ChannelPointsRewardRecord } from '../db/types';

/**
 * Channel-points economy HTTP surface. A "channel" is a creator (channelId =
 * the creator's user id). Viewers read their balance and redeem rewards;
 * creators define rewards, grant points, and review redemptions.
 */

const router = new Hono();
router.use('*', authRateLimit);

const rewardToJson = (reward: ChannelPointsRewardRecord) => ({
  id: reward.id,
  creatorId: reward.creatorId,
  title: reward.title,
  cost: reward.cost,
  prompt: reward.prompt,
  isActive: reward.isActive,
  createdAt: reward.createdAt,
  updatedAt: reward.updatedAt,
});

const grantSchema = z.object({
  userId: z.string().min(1),
  points: z.number().int().positive().max(1_000_000),
});
const rewardCreateSchema = z.object({
  title: z.string().min(1).max(120),
  cost: z.number().int().positive().max(10_000_000),
  prompt: z.string().max(280).optional(),
});
const rewardUpdateSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    cost: z.number().int().positive().max(10_000_000).optional(),
    prompt: z.string().max(280).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'At least one field must be provided' });
const redeemSchema = z.object({
  rewardId: z.string().min(1),
  userInput: z.string().max(280).optional(),
});

// GET /v1/channel-points/channels/:channelId/balance — caller's balance.
router.get('/channels/:channelId/balance', (c) => {
  const user = requireUser(c, 'Sign in to view your channel points');
  if (user instanceof Response) return user;
  const channelId = c.req.param('channelId');
  return c.json({ channelId, userId: user.sub, balance: getBalance(channelId, user.sub) });
});

// GET /v1/channel-points/channels/:channelId/rewards — active rewards for the channel.
router.get('/channels/:channelId/rewards', (c) => {
  const user = requireUser(c, 'Sign in to view channel rewards');
  if (user instanceof Response) return user;
  const channelId = c.req.param('channelId');
  const rewards = db
    .listChannelPointsRewardsForCreator(channelId)
    .filter((r) => r.isActive)
    .map(rewardToJson);
  return c.json({ rewards });
});

// POST /v1/channel-points/channels/:channelId/grant — channel owner credits a viewer.
router.post('/channels/:channelId/grant', async (c) => {
  const user = requireUser(c, 'Sign in to grant channel points');
  if (user instanceof Response) return user;
  const channelId = c.req.param('channelId');
  if (channelId !== user.sub) {
    return c.json({ code: 'forbidden', message: 'You can only grant points on your own channel' }, 403);
  }
  const parsed = await readJsonBody(c, grantSchema);
  if (parsed instanceof Response) return parsed;
  const { balance } = grantPoints({ channelId, userId: parsed.userId, points: parsed.points });
  return c.json({ channelId, userId: parsed.userId, balance }, 201);
});

// POST /v1/channel-points/channels/:channelId/redeem — caller redeems a reward.
router.post('/channels/:channelId/redeem', async (c) => {
  const user = requireUser(c, 'Sign in to redeem channel points');
  if (user instanceof Response) return user;
  const channelId = c.req.param('channelId');
  const parsed = await readJsonBody(c, redeemSchema);
  if (parsed instanceof Response) return parsed;
  const outcome = redeemReward({
    channelId,
    userId: user.sub,
    rewardId: parsed.rewardId,
    userInput: parsed.userInput,
  });
  switch (outcome.kind) {
    case 'ok':
      return c.json(
        {
          redemptionId: outcome.redemption.id,
          rewardId: outcome.redemption.rewardId,
          balance: outcome.balance,
        },
        201,
      );
    case 'reward_not_found':
      return c.json({ code: 'reward_not_found', message: 'No such reward on this channel' }, 404);
    case 'reward_inactive':
      return c.json({ code: 'reward_inactive', message: 'That reward is not active' }, 409);
    case 'insufficient_points':
      return c.json(
        {
          code: 'insufficient_points',
          message: 'Not enough points to redeem this reward',
          balance: outcome.balance,
          cost: outcome.cost,
        },
        409,
      );
    default: {
      const exhaustive: never = outcome;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

// GET /v1/channel-points/channels/:channelId/redemptions — owner's redemption feed.
router.get('/channels/:channelId/redemptions', (c) => {
  const user = requireUser(c, 'Sign in to view redemptions');
  if (user instanceof Response) return user;
  const channelId = c.req.param('channelId');
  if (channelId !== user.sub) {
    return c.json({ code: 'forbidden', message: 'You can only view your own redemptions' }, 403);
  }
  const items = db.listChannelPointsRedemptions(channelId).map((row) => ({
    id: row.id,
    userId: row.userId,
    rewardId: row.rewardId,
    rewardTitle: row.rewardTitle,
    cost: Math.abs(row.pointsDelta),
    userInput: row.userInput,
    createdAt: row.createdAt,
  }));
  return c.json({ items });
});

// POST /v1/channel-points/rewards — create a reward owned by the caller.
router.post('/rewards', async (c) => {
  const user = requireUser(c, 'Sign in to create a reward');
  if (user instanceof Response) return user;
  const parsed = await readJsonBody(c, rewardCreateSchema);
  if (parsed instanceof Response) return parsed;
  const reward = db.createChannelPointsReward({
    id: crypto.randomUUID(),
    creatorId: user.sub,
    title: parsed.title,
    cost: parsed.cost,
    prompt: parsed.prompt,
    isActive: true,
  });
  return c.json(rewardToJson(reward), 201);
});

// PATCH /v1/channel-points/rewards/:rewardId — owner edits a reward.
router.patch('/rewards/:rewardId', async (c) => {
  const user = requireUser(c, 'Sign in to edit a reward');
  if (user instanceof Response) return user;
  const rewardId = c.req.param('rewardId');
  const existing = db.getChannelPointsReward(rewardId);
  if (!existing) return c.json({ code: 'not_found', message: 'Reward not found' }, 404);
  if (existing.creatorId !== user.sub) {
    return c.json({ code: 'forbidden', message: 'You can only edit your own rewards' }, 403);
  }
  const parsed = await readJsonBody(c, rewardUpdateSchema);
  if (parsed instanceof Response) return parsed;
  const updated = db.updateChannelPointsReward(rewardId, parsed);
  return c.json(rewardToJson(updated!));
});

// DELETE /v1/channel-points/rewards/:rewardId — owner removes a reward.
router.delete('/rewards/:rewardId', (c) => {
  const user = requireUser(c, 'Sign in to delete a reward');
  if (user instanceof Response) return user;
  const rewardId = c.req.param('rewardId');
  const existing = db.getChannelPointsReward(rewardId);
  if (!existing) return c.json({ code: 'not_found', message: 'Reward not found' }, 404);
  if (existing.creatorId !== user.sub) {
    return c.json({ code: 'forbidden', message: 'You can only delete your own rewards' }, 403);
  }
  db.deleteChannelPointsReward(rewardId);
  return c.json({ ok: true });
});

export default router;
