/**
 * Plugin discovery service (Phase 7).
 *
 * Builds ranked plugin recommendations by joining install adoption (Phase 1
 * installations) with the Phase-6 rating aggregate, placing each on the
 * ecosystem surface mapped from its domain. Behind a default-off
 * BLACKOUT_PLUGIN_DISCOVERY flag.
 */

import {
    isActiveInstallStatus,
    isPluginDomain,
    rankPluginRecommendations,
    surfaceForDomain,
    type PluginDomain,
    type PluginRecommendation,
} from '@blackout/core';
import { db } from '../db/store';
import { ratingFor } from './pluginSocial';

/** Default-off gate. Flip `BLACKOUT_PLUGIN_DISCOVERY=true` to enable. */
export function pluginDiscoveryEnabled(): boolean {
    return process.env.BLACKOUT_PLUGIN_DISCOVERY === 'true';
}

interface PluginAggregate {
    domain?: PluginDomain;
    installCount: number;
}

export interface DiscoverPluginsQuery {
    surface?: string;
    limit?: number;
}

/**
 * Active installations per plugin become adoption signal; the first non-empty
 * domain seen for a plugin determines its surface. Ratings come from the social
 * aggregate. Results are ranked and optionally filtered to a single surface.
 */
export function discoverPlugins(query: DiscoverPluginsQuery = {}): PluginRecommendation[] {
    const byPlugin = new Map<string, PluginAggregate>();
    for (const install of db.listAllPluginInstallations()) {
        if (!isActiveInstallStatus(install.status)) continue;
        const agg = byPlugin.get(install.pluginId) ?? { domain: undefined, installCount: 0 };
        agg.installCount += 1;
        if (!agg.domain && isPluginDomain(install.domain)) agg.domain = install.domain;
        byPlugin.set(install.pluginId, agg);
    }

    const recommendations: PluginRecommendation[] = [...byPlugin.entries()].map(
        ([pluginId, agg]) => {
            const rating = ratingFor(pluginId);
            return {
                pluginId,
                domain: agg.domain,
                surface: surfaceForDomain(agg.domain),
                installCount: agg.installCount,
                rating: rating.average,
                ratingCount: rating.count,
            };
        },
    );

    const filtered = query.surface
        ? recommendations.filter((r) => r.surface === query.surface)
        : recommendations;
    const ranked = rankPluginRecommendations(filtered);
    return query.limit && query.limit > 0 ? ranked.slice(0, query.limit) : ranked;
}
