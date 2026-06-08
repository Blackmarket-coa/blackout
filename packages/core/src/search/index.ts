/**
 * Cross-entity global search + trending. A read-only aggregation layer over the
 * existing per-entity stores (discovery entities for creators/coalitions, the
 * bounty store, the coalition-project store, coliseum debate topics, and
 * published creator content). No persistence of its own — the server fans out
 * across those stores and returns a unified, ranked result.
 *
 * `debate` searches Coliseum debate topics (Debate Search); `knowledge` searches
 * published creator guides/articles (Knowledge Search).
 */

export const GLOBAL_SEARCH_TYPES = [
    'coalition',
    'creator',
    'bounty',
    'project',
    'debate',
    'knowledge',
] as const;
export type GlobalSearchType = (typeof GLOBAL_SEARCH_TYPES)[number];

export interface GlobalSearchResult {
    type: GlobalSearchType;
    id: string;
    title: string;
    /** Short secondary line (category, reward summary, bio snippet, …). */
    subtitle?: string;
    /** Ranking score; higher is more relevant/active. */
    score: number;
}

export function isGlobalSearchType(value: unknown): value is GlobalSearchType {
    return typeof value === 'string' && (GLOBAL_SEARCH_TYPES as readonly string[]).includes(value);
}

/** Parse a comma-separated `types=` query param into a validated set. */
export function parseGlobalSearchTypes(raw: string | undefined): GlobalSearchType[] {
    if (!raw) return [...GLOBAL_SEARCH_TYPES];
    const parsed = raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(isGlobalSearchType);
    return parsed.length > 0 ? [...new Set(parsed)] : [...GLOBAL_SEARCH_TYPES];
}
