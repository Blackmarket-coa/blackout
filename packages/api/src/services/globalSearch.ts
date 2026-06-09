import type { GlobalSearchResult, GlobalSearchType } from '@blackout/core';
import { discoveryService } from './discovery';
import { listBounties } from './bountyStore';
import { listProjects } from './coalitionStore';
import { listTopics } from './coliseumStore';
import { listContent } from './creatorContentStore';

/** Content kinds surfaced by Knowledge Search — long-form, not short videos. */
const KNOWLEDGE_KINDS = new Set(['guide', 'article']);

const matches = (query: string, ...fields: (string | undefined)[]): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    return fields.some((field) => field?.toLowerCase().includes(q));
};

/** Score a free-text hit: title matches outweigh body/subtitle matches. */
const textScore = (query: string, title: string, subtitle?: string): number => {
    if (!query) return 1;
    const q = query.toLowerCase();
    let score = 0;
    if (title.toLowerCase().includes(q)) score += 2;
    if (subtitle?.toLowerCase().includes(q)) score += 1;
    return score;
};

export interface GlobalSearchInput {
    query?: string;
    types?: GlobalSearchType[];
    region?: string;
    limit?: number;
}

/**
 * Cross-entity search aggregator. Reuses the discovery index for
 * creators/coalitions (so region/visibility/moderation gating is honored) and
 * fans across the bounty + coalition-project stores. Pure read — no persistence.
 */
export function globalSearch(input: GlobalSearchInput = {}): GlobalSearchResult[] {
    const query = input.query?.trim() ?? '';
    const types = new Set<GlobalSearchType>(
        input.types && input.types.length > 0
            ? input.types
            : ['coalition', 'creator', 'bounty', 'project', 'debate', 'knowledge'],
    );
    const limit = Math.max(1, Math.min(input.limit ?? 30, 100));
    const results: GlobalSearchResult[] = [];

    if (types.has('creator') || types.has('coalition')) {
        const entities = discoveryService.browse({
            surface: query ? 'search' : 'trending',
            query: query || undefined,
            region: input.region,
        });
        for (const entity of entities) {
            const type: GlobalSearchType = entity.entityType === 'canopy' ? 'coalition' : 'creator';
            if (!types.has(type)) continue;
            results.push({
                type,
                id: entity.id,
                title: entity.name,
                subtitle: entity.bio || undefined,
                score: entity.activityScore + textScore(query, entity.name, entity.bio),
            });
        }
    }

    if (types.has('bounty')) {
        for (const bounty of listBounties({ status: 'open' })) {
            if (!matches(query, bounty.title, bounty.description)) continue;
            results.push({
                type: 'bounty',
                id: bounty.id,
                title: bounty.title,
                subtitle: bounty.rewardSummary,
                score: textScore(query, bounty.title, bounty.description),
            });
        }
    }

    if (types.has('project')) {
        for (const project of listProjects()) {
            if (!matches(query, project.title, project.description)) continue;
            results.push({
                type: 'project',
                id: project.id,
                title: project.title,
                subtitle: project.category,
                score: textScore(query, project.title, project.description),
            });
        }
    }

    // Debate Search — Coliseum debate topics, matched on title + tags. Hotter
    // debates rank slightly higher via debateHeat (0..1).
    if (types.has('debate')) {
        for (const topic of listTopics()) {
            const tagText = topic.tags.join(' ');
            if (!matches(query, topic.title, tagText)) continue;
            results.push({
                type: 'debate',
                id: topic.id,
                title: topic.title,
                subtitle: topic.category ?? topic.tags[0],
                score: textScore(query, topic.title, tagText) + topic.debateHeat,
            });
        }
    }

    // Knowledge Search — published creator guides/articles (community solutions,
    // tutorials), matched on title + body.
    if (types.has('knowledge')) {
        for (const content of listContent({ status: 'published' })) {
            if (!KNOWLEDGE_KINDS.has(content.kind)) continue;
            if (!matches(query, content.title, content.body)) continue;
            results.push({
                type: 'knowledge',
                id: content.id,
                title: content.title,
                subtitle: content.kind,
                score: textScore(query, content.title, content.body),
            });
        }
    }

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/**
 * Cross-entity trending: top active creators/coalitions plus recent open
 * bounties and active projects. Drives the Discovery trending surface beyond the
 * creators/canopies the discovery service already ranks.
 */
export function globalTrending(input: { region?: string; limit?: number } = {}): GlobalSearchResult[] {
    const limit = Math.max(1, Math.min(input.limit ?? 30, 100));
    const results: GlobalSearchResult[] = [];

    for (const entity of discoveryService.browse({ surface: 'trending', region: input.region })) {
        results.push({
            type: entity.entityType === 'canopy' ? 'coalition' : 'creator',
            id: entity.id,
            title: entity.name,
            subtitle: entity.bio || undefined,
            score: 1000 + entity.activityScore, // entities lead trending
        });
    }

    // Recent open bounties (newest first) score below entities but above quiet ones.
    const openBounties = listBounties({ status: 'open' })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    openBounties.forEach((bounty, index) => {
        results.push({
            type: 'bounty',
            id: bounty.id,
            title: bounty.title,
            subtitle: bounty.rewardSummary,
            score: 500 - index,
        });
    });

    const activeProjects = listProjects()
        .filter((project) => project.status === 'active')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);
    activeProjects.forEach((project, index) => {
        results.push({
            type: 'project',
            id: project.id,
            title: project.title,
            subtitle: project.category,
            score: 400 - index,
        });
    });

    // Trending discussions — hottest live debates by debateHeat. listTopics()
    // already ranks; drop archived topics and band the top slice below projects.
    const hotDebates = listTopics()
        .filter((topic) => topic.status !== 'archived')
        .slice(0, limit);
    hotDebates.forEach((topic, index) => {
        results.push({
            type: 'debate',
            id: topic.id,
            title: topic.title,
            subtitle: topic.category ?? topic.tags[0],
            score: 300 - index,
        });
    });

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

export interface RecommendationInput {
    /** Viewer interest tags (e.g. discovery interests) — entities sharing them
     * are boosted. Case-insensitive. */
    interestTags?: string[];
    /** Ids the viewer already engages with (followed creators, joined
     * coalitions, owned projects) — excluded from suggestions. */
    excludeIds?: string[];
    region?: string;
    limit?: number;
}

/** Each shared interest tag is a strong relevance signal. */
const tagOverlapBoost = (entityTags: readonly string[], interests: Set<string>): number => {
    if (interests.size === 0) return 0;
    let overlap = 0;
    for (const tag of entityTags) if (interests.has(tag.toLowerCase())) overlap += 1;
    return overlap * 3;
};

/**
 * Personalized recommendations across communities, creators, projects, and
 * knowledge content. Reuses the discovery `recommended` surface for
 * creators/coalitions (so gating is honored), fans across active projects and
 * published guides, boosts entities that share the viewer's interest tags, and
 * drops anything the viewer already engages with. Pure read — no persistence.
 */
export function recommend(input: RecommendationInput = {}): GlobalSearchResult[] {
    const limit = Math.max(1, Math.min(input.limit ?? 30, 100));
    const interests = new Set((input.interestTags ?? []).map((tag) => tag.toLowerCase()));
    const exclude = new Set(input.excludeIds ?? []);
    const results: GlobalSearchResult[] = [];

    // Communities + creators the viewer doesn't already follow.
    for (const entity of discoveryService.browse({ surface: 'recommended', region: input.region })) {
        if (exclude.has(entity.id)) continue;
        const type: GlobalSearchType = entity.entityType === 'canopy' ? 'coalition' : 'creator';
        results.push({
            type,
            id: entity.id,
            title: entity.name,
            subtitle: entity.bio || undefined,
            score: 100 + entity.activityScore + tagOverlapBoost(entity.tags, interests),
        });
    }

    // Active projects — boosted when their category matches a viewer interest.
    for (const project of listProjects()) {
        if (project.status !== 'active' || exclude.has(project.id)) continue;
        const categoryBoost = interests.has(project.category.toLowerCase()) ? 6 : 0;
        results.push({
            type: 'project',
            id: project.id,
            title: project.title,
            subtitle: project.category,
            score: 40 + categoryBoost,
        });
    }

    // Recently published knowledge (guides/articles), newest first.
    const knowledge = listContent({ status: 'published' })
        .filter((content) => KNOWLEDGE_KINDS.has(content.kind) && !exclude.has(content.id))
        .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
        .slice(0, limit);
    knowledge.forEach((content, index) => {
        results.push({
            type: 'knowledge',
            id: content.id,
            title: content.title,
            subtitle: content.kind,
            score: 30 - index,
        });
    });

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
