/**
 * Plugin discovery ranking (Phase 7) — pure helpers.
 *
 * Places a plugin recommendation on the ecosystem surface mapped from its
 * domain (`PLUGIN_DOMAIN_SURFACE`) and ranks candidates by a blend of their
 * Phase-6 rating and Phase-1 install count. Pure and deterministic so the API
 * discovery service and tests share the exact scoring.
 */

import { PLUGIN_DOMAIN_SURFACE, type PluginDomain } from './domain';

export interface PluginRecommendation {
    pluginId: string;
    /** Ecosystem surface this recommendation belongs on. */
    surface: string;
    domain?: PluginDomain;
    installCount: number;
    /** Mean rating (0 when unrated). */
    rating: number;
    ratingCount: number;
}

/** Surface a domain maps to, defaulting to the marketplace shelf. */
export function surfaceForDomain(domain: PluginDomain | undefined): string {
    return domain ? PLUGIN_DOMAIN_SURFACE[domain] : 'marketplace';
}

/**
 * Blend rating and adoption into a single score. Rating is weighted heavily
 * (quality, 0..20) so a well-rated newcomer outranks a poorly-rated but popular
 * plugin in the normal range; install count contributes on a log scale
 * (popularity without letting a few mega-installs swamp the signal).
 */
export function scorePluginRecommendation(item: PluginRecommendation): number {
    const ratingComponent = item.rating * 4; // 0..20
    const adoptionComponent = Math.log10(item.installCount + 1) * 2;
    return ratingComponent + adoptionComponent;
}

/** Rank highest-score first; ties broken by install count then plugin id. */
export function rankPluginRecommendations<T extends PluginRecommendation>(items: readonly T[]): T[] {
    return [...items].sort((a, b) => {
        const byScore = scorePluginRecommendation(b) - scorePluginRecommendation(a);
        if (byScore !== 0) return byScore;
        if (b.installCount !== a.installCount) return b.installCount - a.installCount;
        return a.pluginId.localeCompare(b.pluginId);
    });
}
