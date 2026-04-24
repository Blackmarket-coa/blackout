export type DiscoveryEntityType = 'creator' | 'canopy';
export type DiscoveryVisibility = 'public' | 'private' | 'unlisted';
export type DiscoveryModerationStatus = 'approved' | 'under_review' | 'restricted' | 'banned';
export type DiscoveryActivity = 'active' | 'quiet';

export interface DiscoveryEntityInput {
  id: string;
  entityType: DiscoveryEntityType;
  name: string;
  bio?: string;
  tags?: string[];
  language?: string;
  isPaid?: boolean;
  moderationStatus?: DiscoveryModerationStatus;
  visibility?: DiscoveryVisibility;
  regionAllowlist?: string[];
  regionBlocklist?: string[];
  legalRestrictedRegions?: string[];
}

export interface DiscoveryEntity extends DiscoveryEntityInput {
  bio: string;
  tags: string[];
  language: string;
  isPaid: boolean;
  moderationStatus: DiscoveryModerationStatus;
  visibility: DiscoveryVisibility;
  regionAllowlist: string[];
  regionBlocklist: string[];
  legalRestrictedRegions: string[];
  activityScore: number;
  lastActivityAt?: string;
  updatedAt: string;
}

export interface DiscoveryAnalytics {
  impressions: number;
  clicks: number;
  joins: number;
  subscribes: number;
}

export type DiscoveryEventStage = 'impression' | 'click' | 'join' | 'subscribe';

const nowIso = () => new Date().toISOString();

function uniqueLower(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeEntity(input: DiscoveryEntityInput, previous?: DiscoveryEntity): DiscoveryEntity {
  return {
    ...input,
    bio: input.bio ?? previous?.bio ?? '',
    tags: uniqueLower(input.tags ?? previous?.tags),
    language: (input.language ?? previous?.language ?? 'en').trim().toLowerCase(),
    isPaid: input.isPaid ?? previous?.isPaid ?? false,
    moderationStatus: input.moderationStatus ?? previous?.moderationStatus ?? 'approved',
    visibility: input.visibility ?? previous?.visibility ?? 'public',
    regionAllowlist: uniqueLower(input.regionAllowlist ?? previous?.regionAllowlist),
    regionBlocklist: uniqueLower(input.regionBlocklist ?? previous?.regionBlocklist),
    legalRestrictedRegions: uniqueLower(input.legalRestrictedRegions ?? previous?.legalRestrictedRegions),
    activityScore: previous?.activityScore ?? 0,
    lastActivityAt: previous?.lastActivityAt,
    updatedAt: nowIso(),
  };
}

function canShowInRegion(entity: DiscoveryEntity, region?: string): boolean {
  if (!region) return true;
  const normalizedRegion = region.trim().toLowerCase();
  if (!normalizedRegion) return true;

  if (entity.legalRestrictedRegions.includes(normalizedRegion)) return false;
  if (entity.regionBlocklist.includes(normalizedRegion)) return false;
  if (entity.regionAllowlist.length > 0 && !entity.regionAllowlist.includes(normalizedRegion)) return false;
  return true;
}

function isPubliclyDiscoverable(entity: DiscoveryEntity): boolean {
  if (entity.moderationStatus === 'banned') return false;
  if (entity.visibility === 'private' || entity.visibility === 'unlisted') return false;
  return true;
}

function getRelevanceScore(entity: DiscoveryEntity, query?: string): number {
  if (!query) return entity.activityScore;
  const q = query.trim().toLowerCase();
  if (!q) return entity.activityScore;

  if (entity.name.toLowerCase() === q) return 1000;
  if (entity.name.toLowerCase().startsWith(q)) return 700;
  if (entity.name.toLowerCase().includes(q)) return 500;
  if (entity.bio.toLowerCase().includes(q)) return 250;
  if (entity.tags.some((tag) => tag.includes(q))) return 200;
  return 0;
}

export class DiscoveryService {
  private sourceProfiles = new Map<string, DiscoveryEntity>();
  private index = new Map<string, DiscoveryEntity>();
  private dirtyIds = new Set<string>();
  private analytics = new Map<string, DiscoveryAnalytics>();

  upsertProfile(input: DiscoveryEntityInput): DiscoveryEntity {
    const previous = this.sourceProfiles.get(input.id);
    const normalized = normalizeEntity(input, previous);
    this.sourceProfiles.set(input.id, normalized);
    this.dirtyIds.add(input.id);
    return normalized;
  }

  recordActivity(entityId: string, delta = 1): DiscoveryEntity | null {
    const existing = this.sourceProfiles.get(entityId);
    if (!existing) return null;

    const next = {
      ...existing,
      activityScore: Math.max(0, existing.activityScore + Math.max(1, Math.floor(delta))),
      lastActivityAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.sourceProfiles.set(entityId, next);
    this.dirtyIds.add(entityId);
    return next;
  }

  runFullIndex(): { indexed: number; indexedAt: string } {
    this.index = new Map(this.sourceProfiles.entries());
    this.dirtyIds.clear();
    return { indexed: this.index.size, indexedAt: nowIso() };
  }

  runIncrementalIndex(): { indexed: number; indexedAt: string; changedEntityIds: string[] } {
    const changedEntityIds = [...this.dirtyIds.values()];
    for (const id of changedEntityIds) {
      const source = this.sourceProfiles.get(id);
      if (source) this.index.set(id, source);
    }
    this.dirtyIds.clear();
    return { indexed: changedEntityIds.length, indexedAt: nowIso(), changedEntityIds };
  }

  recordFunnelEvent(entityId: string, stage: DiscoveryEventStage): DiscoveryAnalytics | null {
    if (!this.index.has(entityId)) return null;
    const current = this.analytics.get(entityId) ?? { impressions: 0, clicks: 0, joins: 0, subscribes: 0 };
    const next = { ...current };

    if (stage === 'impression') next.impressions += 1;
    if (stage === 'click') next.clicks += 1;
    if (stage === 'join') next.joins += 1;
    if (stage === 'subscribe') next.subscribes += 1;

    this.analytics.set(entityId, next);
    return next;
  }

  getFunnelSummary(): {
    totals: DiscoveryAnalytics;
    conversion: { clickThroughRate: number; joinRate: number; subscribeRate: number };
  } {
    const totals = [...this.analytics.values()].reduce<DiscoveryAnalytics>(
      (acc, item) => ({
        impressions: acc.impressions + item.impressions,
        clicks: acc.clicks + item.clicks,
        joins: acc.joins + item.joins,
        subscribes: acc.subscribes + item.subscribes,
      }),
      { impressions: 0, clicks: 0, joins: 0, subscribes: 0 },
    );

    const clickThroughRate = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    const joinRate = totals.clicks > 0 ? totals.joins / totals.clicks : 0;
    const subscribeRate = totals.joins > 0 ? totals.subscribes / totals.joins : 0;

    return {
      totals,
      conversion: { clickThroughRate, joinRate, subscribeRate },
    };
  }

  browse(input: {
    surface: 'trending' | 'categories' | 'recommended' | 'search';
    query?: string;
    tag?: string;
    language?: string;
    activity?: DiscoveryActivity;
    paid?: 'paid' | 'free' | 'all';
    entityType?: DiscoveryEntityType | 'all';
    sort?: 'relevance' | 'activity' | 'name';
    region?: string;
  }): DiscoveryEntity[] {
    const paid = input.paid ?? 'all';
    const entityType = input.entityType ?? 'all';
    const activity = input.activity ?? 'all';
    const normalizedTag = input.tag?.trim().toLowerCase();
    const normalizedLanguage = input.language?.trim().toLowerCase();

    const discoverable = [...this.index.values()]
      .filter(isPubliclyDiscoverable)
      .filter((item) => canShowInRegion(item, input.region))
      .filter((item) => (entityType === 'all' ? true : item.entityType === entityType))
      .filter((item) => (paid === 'all' ? true : paid === 'paid' ? item.isPaid : !item.isPaid))
      .filter((item) => (normalizedTag ? item.tags.includes(normalizedTag) : true))
      .filter((item) => (normalizedLanguage ? item.language === normalizedLanguage : true))
      .filter((item) => (activity === 'all' ? true : activity === 'active' ? item.activityScore > 0 : item.activityScore === 0));

    if (input.surface === 'trending') {
      return discoverable.sort((a, b) => b.activityScore - a.activityScore || b.name.localeCompare(a.name));
    }

    if (input.surface === 'categories') {
      return discoverable.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (input.surface === 'recommended') {
      return discoverable.sort((a, b) => (b.tags.length + b.activityScore) - (a.tags.length + a.activityScore));
    }

    const sort = input.sort ?? 'relevance';
    if (sort === 'name') {
      return discoverable.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sort === 'activity') {
      return discoverable.sort((a, b) => b.activityScore - a.activityScore);
    }

    return discoverable.sort((a, b) => getRelevanceScore(b, input.query) - getRelevanceScore(a, input.query));
  }
}

export const discoveryService = new DiscoveryService();
