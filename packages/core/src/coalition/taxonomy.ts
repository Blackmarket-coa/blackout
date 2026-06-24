export const SPATIAL_LAYER_DEFINITIONS = [
    { key: 'video', label: 'Stories', aliases: ['video', 'videos', 'stories'] },
    { key: 'vendors', label: 'Marketplace', aliases: ['vendors', 'marketplace', 'markets'] },
    { key: 'jobs', label: 'Jobs', aliases: ['jobs'] },
    { key: 'gardens', label: 'Gardens', aliases: ['gardens'] },
    { key: 'votes', label: 'Governance', aliases: ['votes', 'governance'] },
    { key: 'aid', label: 'Mutual Aid', aliases: ['aid', 'mutual aid'] },
    { key: 'infra', label: 'Infrastructure', aliases: ['infra', 'infrastructure'] },
    { key: 'events', label: 'Events', aliases: ['events', 'event'] },
    { key: 'dens', label: 'Dens', aliases: ['dens', 'den'] },
    { key: 'streams', label: 'Streams', aliases: ['streams', 'stream', 'livestreams'] },
    { key: 'projects', label: 'Projects', aliases: ['projects', 'project'] },
    { key: 'communities', label: 'Communities', aliases: ['communities', 'community', 'canopies'] },
    { key: 'mycelium', label: 'Federation', aliases: ['mycelium', 'federation', 'constellation'] },
] as const;

export type SpatialLayerKey = (typeof SPATIAL_LAYER_DEFINITIONS)[number]['key'];
export type SpatialLayerLabel = (typeof SPATIAL_LAYER_DEFINITIONS)[number]['label'];

export const SPATIAL_LAYER_KEYS: SpatialLayerKey[] = SPATIAL_LAYER_DEFINITIONS.map(
    (definition) => definition.key,
);

const ALIAS_MAP: Record<string, SpatialLayerKey> = (() => {
    const map: Record<string, SpatialLayerKey> = {};
    for (const definition of SPATIAL_LAYER_DEFINITIONS) {
        for (const alias of definition.aliases) {
            map[alias] = definition.key;
        }
    }
    return map;
})();

export function normalizeSpatialLayerKey(layer: string | null | undefined): SpatialLayerKey | null {
    if (!layer) return null;
    return ALIAS_MAP[layer.trim().toLowerCase()] ?? null;
}

export function normalizeSpatialLayerKeys(layers: readonly string[]): SpatialLayerKey[] {
    const seen = new Set<SpatialLayerKey>();
    for (const layer of layers) {
        const normalized = normalizeSpatialLayerKey(layer);
        if (normalized) seen.add(normalized);
    }
    return [...seen];
}

export const SPATIAL_EVENT_CATEGORIES = [
    { key: 'arson', label: 'Arson' },
    { key: 'wildfire', label: 'Wildfire' },
    { key: 'farm', label: 'Farms' },
    { key: 'community_event', label: 'Community Events' },
    { key: 'mass_shooting', label: 'Mass Shooting Alerts' },
] as const;

export type SpatialEventCategoryKey = (typeof SPATIAL_EVENT_CATEGORIES)[number]['key'];
