import type { LeaderboardCategory, LeaderboardEntry } from '@blackout/core';
import { discoveryService } from './discovery';
import { db } from '../db/store';
import { entryCount } from './coliseumChallenges';

const PROJECT_STATUS_WEIGHT: Record<string, number> = {
    active: 3,
    complete: 2,
    paused: 1,
    proposed: 0,
};

function rank(entries: Omit<LeaderboardEntry, 'rank'>[], limit: number): LeaderboardEntry[] {
    return entries
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * Cross-store leaderboard aggregator. Pure read — ranks creators/coalitions from
 * the discovery index, projects from the coalition-project store, and challenges
 * by entry count. No persistence of its own.
 */
export function leaderboard(
    category: LeaderboardCategory,
    options: { region?: string; limit?: number } = {},
): LeaderboardEntry[] {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));

    if (category === 'creators' || category === 'coalitions') {
        const wantCanopy = category === 'coalitions';
        const entries = discoveryService
            .browse({
                surface: 'trending',
                entityType: wantCanopy ? 'canopy' : 'creator',
                region: options.region,
            })
            .map((entity) => ({
                category,
                id: entity.id,
                title: entity.name,
                subtitle: entity.bio || undefined,
                score: entity.activityScore,
            }));
        return rank(entries, limit);
    }

    if (category === 'projects') {
        const entries = db.listCoalitionProjects().map((project) => ({
            category,
            id: project.id,
            title: project.title,
            subtitle: project.category,
            // Status dominates; recency (epoch ms) breaks ties within a status.
            score: (PROJECT_STATUS_WEIGHT[project.status] ?? 0) * 1e13 + Date.parse(project.updatedAt),
        }));
        return rank(entries, limit);
    }

    // challenges — ranked by number of entries (proxy for momentum / launches).
    const entries = db.listColiseumChallenges().map((challenge) => ({
        category,
        id: challenge.id,
        title: challenge.title,
        subtitle: challenge.category,
        score: entryCount(challenge.id),
    }));
    return rank(entries, limit);
}
