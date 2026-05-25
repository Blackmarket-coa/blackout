/**
 * Plugin domain taxonomy.
 *
 * This is the ecosystem-domain axis for plugins/kits — orthogonal to the
 * commerce-flavored `MarketplaceCategory` (which classifies how a listing is
 * sold). A plugin's `domain` says which part of the Blackout ecosystem it
 * extends, and (via `PLUGIN_DOMAIN_SURFACE`) where it should surface in
 * discovery.
 *
 * AI plugins are a domain of their own because they are confined to AI dens
 * (see `den/classification.ts` `aiToolsEnabled`).
 */

export const PLUGIN_DOMAINS = [
    'community-infrastructure',
    'coliseum',
    'creator-hub',
    'coalition',
    'profile',
    'marketplace',
    'ai',
] as const;

export type PluginDomain = (typeof PLUGIN_DOMAINS)[number];

export function isPluginDomain(value: unknown): value is PluginDomain {
    return typeof value === 'string' && (PLUGIN_DOMAINS as readonly string[]).includes(value);
}

/**
 * Maps each plugin domain to the ecosystem surface where its recommendations
 * belong. Consumed by discovery (unified feed / discovery surface) to place a
 * plugin/kit recommendation next to the activity it extends rather than in an
 * isolated store.
 */
export const PLUGIN_DOMAIN_SURFACE: Record<PluginDomain, string> = {
    'community-infrastructure': 'communities',
    coliseum: 'coliseum',
    'creator-hub': 'creators',
    coalition: 'coalition',
    profile: 'profile',
    marketplace: 'marketplace',
    ai: 'aiden',
};
