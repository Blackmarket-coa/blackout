import { tierFromScore } from '../governance';
import type { ReputationProfile, ReputationStanding, ReputationSubject } from '../reputation';
import type { ReputationTier } from '../types';

/**
 * Creator "character sheet" progression, derived purely from the reputation
 * system. Reputation is earned through ecosystem *interaction* (votes cast,
 * arguments endorsed, proposals passed, disputes won, vendor transactions —
 * see `REPUTATION_EVENT_POINTS`), which is exactly the "XP from interaction"
 * the public creator profile surfaces. Income is intentionally *not* folded in
 * here: monetization lives with FreeBlackMarket and is represented separately.
 *
 * This module is deterministic and side-effect free so the client and any
 * future server renderer agree on the same level for the same reputation.
 */

/** Cumulative XP required to *reach* a given level. Level 1 starts at 0 XP. */
export function cumulativeXpForLevel(level: number): number {
    if (level <= 1) return 0;
    // Quadratic curve: 0, 100, 300, 600, 1000, 1500, ... which lines the
    // reputation tier thresholds (vendor 100, coordinator 500, arbiter 1000)
    // up with sensible level breaks.
    return 50 * level * (level - 1);
}

/** Invert the cumulative curve: the highest level whose XP gate `xp` clears. */
export function levelFromXp(xp: number): number {
    if (xp <= 0) return 1;
    const level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2);
    return Math.max(1, level);
}

/** Flavor title for a creator's standing, mapped from their reputation tier. */
export const CREATOR_LEVEL_TITLES: Record<ReputationTier, string> = {
    member: 'Rising Creator',
    vendor: 'Established Creator',
    coordinator: 'Master Creator',
    arbiter: 'Legendary Creator',
};

export interface CreatorLevel {
    /** Current level (>= 1). */
    level: number;
    /** Total accumulated XP (== reputation overall score). */
    xp: number;
    /** XP earned since the start of the current level. */
    xpIntoLevel: number;
    /** XP span of the current level (xpIntoLevel / xpForNextLevel == progress). */
    xpForNextLevel: number;
    /** Reputation tier backing the title. */
    tier: ReputationTier;
    /** Flavor class title. */
    title: string;
}

/**
 * Derive a creator's level/XP from their reputation profile. Safe to call with
 * an absent/partial profile — defaults to a level-1 newcomer.
 */
export function creatorLevelFromReputation(rep?: ReputationProfile | null): CreatorLevel {
    const xp = Math.max(0, Math.floor(rep?.overall?.score ?? 0));
    const tier = rep?.overall?.tier ?? tierFromScore(xp);
    const level = levelFromXp(xp);
    const base = cumulativeXpForLevel(level);
    const next = cumulativeXpForLevel(level + 1);
    return {
        level,
        xp,
        xpIntoLevel: xp - base,
        xpForNextLevel: Math.max(1, next - base),
        tier,
        title: CREATOR_LEVEL_TITLES[tier],
    };
}

export interface CreatorSkill {
    subject: ReputationSubject;
    score: number;
    tier: ReputationTier;
}

/**
 * The creator's per-subject reputation rendered as a "skill tree": each Coliseum
 * topic category they've earned standing in becomes a skill, ranked high→low.
 */
export function creatorSkillsFromReputation(rep?: ReputationProfile | null): CreatorSkill[] {
    const bySubject = rep?.bySubject ?? {};
    return (Object.entries(bySubject) as Array<[ReputationSubject, ReputationStanding]>)
        .filter(([, standing]) => standing && standing.score > 0)
        .map(([subject, standing]) => ({
            subject,
            score: standing.score,
            tier: standing.tier,
        }))
        .sort((a, b) => b.score - a.score);
}
