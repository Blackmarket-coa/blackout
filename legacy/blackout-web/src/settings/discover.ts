import type { DiscoverCandidate } from "../types";

export interface DiscoverRankingWeights {
  relevance: number;
  recency: number;
  socialProximity: number;
}

export interface DiscoverRequest {
  limit?: number;
  page?: number;
  now?: string;
}

const DEFAULT_WEIGHTS: DiscoverRankingWeights = {
  relevance: 0.5,
  recency: 0.3,
  socialProximity: 0.2,
};

function normalize(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function computeRecencyScore(publishedAtIso: string, nowIso: string): number {
  const published = new Date(publishedAtIso).getTime();
  const now = new Date(nowIso).getTime();
  const ageHours = Math.max(0, (now - published) / 3_600_000);

  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.8;
  if (ageHours <= 72) return 0.6;
  if (ageHours <= 168) return 0.4;
  return 0.2;
}

export interface DiscoverSignal {
  relevance: number;
  socialProximity: number;
  publishedAt: string;
}

export interface DiscoverSourceItem {
  id: string;
  serverId: string;
  channelId: string;
  signal: DiscoverSignal;
}

export function rankDiscoverCandidates(
  items: DiscoverSourceItem[],
  request: DiscoverRequest = {},
  weights: DiscoverRankingWeights = DEFAULT_WEIGHTS,
): DiscoverCandidate[] {
  const now = request.now ?? new Date().toISOString();
  const page = Math.max(0, request.page ?? 0);
  const limit = Math.max(1, Math.min(10, request.limit ?? 10));

  const scored = items.map((item) => {
    const recency = computeRecencyScore(item.signal.publishedAt, now);
    const weighted = (normalize(item.signal.relevance) * weights.relevance)
      + (normalize(recency) * weights.recency)
      + (normalize(item.signal.socialProximity) * weights.socialProximity);

    let reason: DiscoverCandidate["reason"] = "relevance";
    const reasonScores = {
      relevance: normalize(item.signal.relevance) * weights.relevance,
      recency: normalize(recency) * weights.recency,
      social_proximity: normalize(item.signal.socialProximity) * weights.socialProximity,
    };

    if (reasonScores.recency >= reasonScores.relevance && reasonScores.recency >= reasonScores.social_proximity) {
      reason = "recency";
    } else if (reasonScores.social_proximity >= reasonScores.relevance) {
      reason = "social_proximity";
    }

    return {
      id: item.id,
      serverId: item.serverId,
      channelId: item.channelId,
      score: Number(weighted.toFixed(4)),
      reason,
    } satisfies DiscoverCandidate;
  });

  scored.sort((left, right) => right.score - left.score);

  const start = page * limit;
  return scored.slice(start, start + limit);
}
