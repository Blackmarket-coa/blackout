export const COLISEUM_TOPIC_CATEGORIES = [
    { key: 'politics', label: 'Politics', aliases: ['politics', 'political'] },
    { key: 'economy', label: 'Economy', aliases: ['economy', 'economic', 'finance', 'markets'] },
    { key: 'tech', label: 'Tech', aliases: ['tech', 'technology', 'ai'] },
    { key: 'culture', label: 'Culture', aliases: ['culture', 'cultural', 'arts'] },
    { key: 'science', label: 'Science', aliases: ['science', 'scientific', 'research'] },
    { key: 'world', label: 'World', aliases: ['world', 'international', 'global'] },
    { key: 'local', label: 'Local', aliases: ['local', 'regional'] },
    { key: 'other', label: 'Other', aliases: ['other', 'misc'] },
] as const;

export type ColiseumTopicCategoryKey = (typeof COLISEUM_TOPIC_CATEGORIES)[number]['key'];
export type ColiseumTopicCategoryLabel = (typeof COLISEUM_TOPIC_CATEGORIES)[number]['label'];

export const COLISEUM_TOPIC_CATEGORY_KEYS: ColiseumTopicCategoryKey[] =
    COLISEUM_TOPIC_CATEGORIES.map((definition) => definition.key);

const ALIAS_MAP: Record<string, ColiseumTopicCategoryKey> = (() => {
    const map: Record<string, ColiseumTopicCategoryKey> = {};
    for (const definition of COLISEUM_TOPIC_CATEGORIES) {
        for (const alias of definition.aliases) {
            map[alias] = definition.key;
        }
    }
    return map;
})();

export function normalizeColiseumCategoryKey(
    category: string | null | undefined,
): ColiseumTopicCategoryKey | null {
    if (!category) return null;
    return ALIAS_MAP[category.trim().toLowerCase()] ?? null;
}

export function normalizeColiseumCategoryKeys(
    categories: readonly string[],
): ColiseumTopicCategoryKey[] {
    const seen = new Set<ColiseumTopicCategoryKey>();
    for (const category of categories) {
        const normalized = normalizeColiseumCategoryKey(category);
        if (normalized) seen.add(normalized);
    }
    return [...seen];
}
