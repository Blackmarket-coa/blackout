/**
 * Coliseum Leaderboards. A read-only ranking shape shared by server and client.
 * The server aggregates rankings from existing stores (discovery activity,
 * coalition projects, challenge entries) — no persistence of its own.
 */

export const LEADERBOARD_CATEGORIES = ['creators', 'coalitions', 'projects', 'challenges'] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export interface LeaderboardEntry {
    category: LeaderboardCategory;
    id: string;
    title: string;
    /** Short secondary line (category, status, member context, …). */
    subtitle?: string;
    /** Ranking metric (activity, votes, project count, …). */
    score: number;
    /** 1-based position within the category. */
    rank: number;
}

export function isLeaderboardCategory(value: unknown): value is LeaderboardCategory {
    return (
        typeof value === 'string' && (LEADERBOARD_CATEGORIES as readonly string[]).includes(value)
    );
}
