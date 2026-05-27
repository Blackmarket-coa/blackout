import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { ChannelPointsLedgerRecord } from '../db/types';
import { dispatchEvent } from './outboundEventWebhooks';
import { log } from '../telemetry/logger';

/**
 * Native channel-points engagement economy. Viewers earn points on a creator's
 * channel and redeem them for the creator's rewards. Balances are derived from
 * the append-only ledger (db.getChannelPointsBalance); this service owns the
 * earn + redeem transitions and emits the existing `channelpoints.redeemed`
 * outbound event so creator webhooks / overlays fire on a redemption.
 */

export interface GrantResult {
  entry: ChannelPointsLedgerRecord;
  balance: number;
}

export const getBalance = (channelId: string, userId: string): number =>
  db.getChannelPointsBalance(channelId, userId);

/**
 * Credit points to a viewer on a channel (creator-driven award, or a
 * server-side watch-time grant in the future). Negative/zero is rejected by
 * the caller; we clamp defensively.
 */
export const grantPoints = (input: {
  channelId: string;
  userId: string;
  points: number;
  reason?: 'grant' | 'refund';
}): GrantResult => {
  const entry = db.appendChannelPointsLedger({
    id: randomUUID(),
    channelId: input.channelId,
    userId: input.userId,
    pointsDelta: Math.max(0, Math.floor(input.points)),
    reason: input.reason ?? 'grant',
  });
  return { entry, balance: db.getChannelPointsBalance(input.channelId, input.userId) };
};

export type RedeemOutcome =
  | { kind: 'ok'; redemption: ChannelPointsLedgerRecord; balance: number }
  | { kind: 'reward_not_found' }
  | { kind: 'reward_inactive' }
  | { kind: 'insufficient_points'; balance: number; cost: number };

/**
 * Redeem a reward: validates the reward belongs to the channel and is active,
 * checks the viewer's balance, appends a negative ledger entry, and dispatches
 * the `channelpoints.redeemed` outbound event. Append-only — a refund is a
 * later positive `grant` entry, never a mutation of this row.
 */
export const redeemReward = (input: {
  channelId: string;
  userId: string;
  rewardId: string;
  userInput?: string;
}): RedeemOutcome => {
  const reward = db.getChannelPointsReward(input.rewardId);
  if (!reward || reward.creatorId !== input.channelId) return { kind: 'reward_not_found' };
  if (!reward.isActive) return { kind: 'reward_inactive' };

  const balance = db.getChannelPointsBalance(input.channelId, input.userId);
  if (balance < reward.cost) {
    return { kind: 'insufficient_points', balance, cost: reward.cost };
  }

  const redemption = db.appendChannelPointsLedger({
    id: randomUUID(),
    channelId: input.channelId,
    userId: input.userId,
    pointsDelta: -reward.cost,
    reason: 'redeem',
    rewardId: reward.id,
    rewardTitle: reward.title,
    userInput: input.userInput,
  });

  void dispatchEvent({
    type: 'channelpoints.redeemed',
    blackoutUserId: input.channelId,
    data: {
      source: 'channel_points',
      channelId: input.channelId,
      userId: input.userId,
      rewardId: reward.id,
      rewardTitle: reward.title,
      cost: reward.cost,
      userInput: input.userInput ?? null,
    },
  }).catch((err) =>
    log.warn('channel_points_redeem_dispatch_threw', { error: String(err) }),
  );

  return { kind: 'ok', redemption, balance: balance - reward.cost };
};
