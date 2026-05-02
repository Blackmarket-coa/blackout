import { deriveSpatialEventStatus, type SpatialEventStatus } from './eventStatus';
import { normalizeSpatialLayerKey, type SpatialLayerKey } from './taxonomy';

export type SpatialVisibility = 'public' | 'community' | 'private';

export type SpatialEventType =
    | 'arson'
    | 'wildfire'
    | 'farm'
    | 'community_event'
    | 'mass_shooting'
    | 'infrastructure'
    | 'aid'
    | 'jobs'
    | 'other';

export type SpatialSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface SpatialFeedItem {
    id: string;
    layer: SpatialLayerKey;
    title: string;
    latitude: number;
    longitude: number;
    visibility: SpatialVisibility;
    eventType: SpatialEventType;
    startsAt: string;
    endsAt?: string;
    status: SpatialEventStatus;
    severity?: SpatialSeverity;
    confidence?: number;
    source?: 'gateway' | 'medusa' | 'blackstar' | 'blackout';
    meta?: Record<string, unknown>;
}

export interface CoalitionFeedItem {
    id: string;
    kind: 'video' | 'event' | 'aid' | 'listing' | 'proposal';
    title: string;
    body?: string;
    createdAt: string;
    canopyId?: string;
    denId?: string;
    authorId?: string;
    mediaUrl?: string;
    importance: number;
    impact: number;
    socialImpact: number;
    score: number;
    tags?: string[];
}

export type CoalitionRankingModel =
    | 'coalition_social_v1'
    | 'recency_only'
    | 'importance_only';

export interface CoalitionRankingWeights {
    importance: number;
    impact: number;
    socialImpact: number;
    recencyHalfLifeHours: number;
}

export const DEFAULT_RANKING_WEIGHTS: CoalitionRankingWeights = {
    importance: 0.5,
    impact: 0.3,
    socialImpact: 0.2,
    recencyHalfLifeHours: 12,
};

const SEVERITY_RANK: Record<SpatialSeverity, number> = {
    low: 0.25,
    moderate: 0.5,
    high: 0.75,
    critical: 1,
};

export function severityToScore(severity: SpatialSeverity | undefined): number {
    return severity === undefined ? 0 : SEVERITY_RANK[severity];
}

function recencyScore(createdAtIso: string, halfLifeHours: number, nowMs: number): number {
    const createdMs = Date.parse(createdAtIso);
    if (Number.isNaN(createdMs)) return 0;
    const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
    return Math.pow(0.5, ageHours / halfLifeHours);
}

export function scoreCoalitionItem(
    item: Omit<CoalitionFeedItem, 'score'>,
    options: {
        model?: CoalitionRankingModel;
        weights?: Partial<CoalitionRankingWeights>;
        nowMs?: number;
    } = {},
): number {
    const model = options.model ?? 'coalition_social_v1';
    const weights = { ...DEFAULT_RANKING_WEIGHTS, ...options.weights };
    const nowMs = options.nowMs ?? Date.now();

    if (model === 'recency_only') {
        return recencyScore(item.createdAt, weights.recencyHalfLifeHours, nowMs);
    }
    if (model === 'importance_only') {
        return clamp01(item.importance);
    }

    const recency = recencyScore(item.createdAt, weights.recencyHalfLifeHours, nowMs);
    return clamp01(
        weights.importance * clamp01(item.importance) +
            weights.impact * clamp01(item.impact) +
            weights.socialImpact * clamp01(item.socialImpact) * recency,
    );
}

export function rankCoalitionFeed(
    items: ReadonlyArray<Omit<CoalitionFeedItem, 'score'>>,
    options: Parameters<typeof scoreCoalitionItem>[1] = {},
): CoalitionFeedItem[] {
    return items
        .map((item) => ({ ...item, score: scoreCoalitionItem(item, options) }))
        .sort((a, b) => b.score - a.score);
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export function normalizeSpatialFeedItem<T extends Omit<SpatialFeedItem, 'status'> & { status?: SpatialEventStatus }>(
    item: T,
): SpatialFeedItem | null {
    const layer = normalizeSpatialLayerKey(item.layer);
    if (!layer) return null;
    return {
        ...item,
        layer,
        status: item.status ?? deriveSpatialEventStatus({ startsAt: item.startsAt, endsAt: item.endsAt }),
    };
}
