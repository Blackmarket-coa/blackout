import type { GlobalSearchResult, GlobalSearchType } from '@blackout/core';
import { discoveryService } from './discovery';
import { listBounties } from './bountyStore';
import { listProjects } from './coalitionStore';

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
            : ['coalition', 'creator', 'bounty', 'project'],
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

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
