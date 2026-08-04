/**
 * How a proposed topic arrived.
 *
 * Coliseum used to accept exactly one kind of topic: a debate anchored to a
 * news article, with a headline and a source URL both required. That made the
 * arena unusable for the thing people actually want to do most — ask a bare
 * question — and it left three sibling entities (`ColiseumMatch`'s
 * `proposition`, `ColiseumShout`'s video, the Arena callout) reimplementing
 * "here is a thing to argue about" in parallel.
 *
 * A seed is that idea, stated once. Every topic has a `title` (the proposition
 * in words); the seed says what, if anything, backs it.
 */

/**
 * Media attached to a topic seed. Wider than `ColiseumArgumentMedia`, which is
 * video-only — a screenshot is a perfectly good thing to argue about, and every
 * `ColiseumArgumentMedia` is assignable to this.
 */
export interface ColiseumTopicMedia {
    kind: 'video' | 'image';
    mxc: string;
    posterMxc?: string;
    durationMs?: number;
}

/** A link-seeded topic's article metadata — the old `ColiseumNewsAnchor`. */
export interface ColiseumLinkSeedSource {
    sourceUrl: string;
    headline: string;
    publishedAt: string;
    opengraphImage?: string;
}

export type ColiseumTopicSeed =
    /** A bare question or statement. No link, no media, no opponent. */
    | { kind: 'text' }
    /** An article or news URL. The original — and formerly only — shape. */
    | ({ kind: 'link' } & ColiseumLinkSeedSource)
    /** A video or image take. Absorbs what used to be a standalone Shout. */
    | { kind: 'media'; media: ColiseumTopicMedia }
    /**
     * A proposition aimed at someone. Absorbs the Arena callout: `opponentId`
     * names a target, or `open` leaves it for any taker.
     */
    | { kind: 'challenge'; opponentId?: string; open?: boolean };

export type ColiseumTopicSeedKind = ColiseumTopicSeed['kind'];

export const COLISEUM_TOPIC_SEED_KINDS: readonly ColiseumTopicSeedKind[] = [
    'text',
    'link',
    'media',
    'challenge',
] as const;

export function isColiseumTopicSeedKind(value: unknown): value is ColiseumTopicSeedKind {
    return (
        typeof value === 'string' &&
        (COLISEUM_TOPIC_SEED_KINDS as readonly string[]).includes(value)
    );
}

/**
 * The date a topic's recency should decay from.
 *
 * Only a link seed has a publish date of its own. Everything else decays from
 * when it was proposed — the alternative is an unparseable date, which
 * `recencyScore` scores as a flat `0`, silently costing a non-link topic the
 * 55% of its heat that recency contributes and burying it in the ranked feed.
 */
export function seedPublishedAt(seed: ColiseumTopicSeed, createdAt: string): string {
    return seed.kind === 'link' ? seed.publishedAt : createdAt;
}

/**
 * Project a link seed back into the legacy `newsAnchor` shape so existing
 * readers (and any client built before seeds) keep working. Returns undefined
 * for every other kind — those topics genuinely have no article behind them.
 */
export function seedToNewsAnchor(seed: ColiseumTopicSeed): ColiseumLinkSeedSource | undefined {
    if (seed.kind !== 'link') return undefined;
    return {
        sourceUrl: seed.sourceUrl,
        headline: seed.headline,
        publishedAt: seed.publishedAt,
        ...(seed.opengraphImage ? { opengraphImage: seed.opengraphImage } : {}),
    };
}

/**
 * Build a seed from a legacy `newsAnchor`. Used on both the write path (a
 * client that predates seeds still posts a bare `newsAnchor`) and the read path
 * (rows migrated from before the `seed` column existed).
 */
export function newsAnchorToSeed(anchor: ColiseumLinkSeedSource): ColiseumTopicSeed {
    return {
        kind: 'link',
        sourceUrl: anchor.sourceUrl,
        headline: anchor.headline,
        publishedAt: anchor.publishedAt,
        ...(anchor.opengraphImage ? { opengraphImage: anchor.opengraphImage } : {}),
    };
}

/**
 * Resolve the seed for a topic that may carry either representation. Prefers an
 * explicit seed, falls back to a legacy anchor, and finally degrades to `text`
 * rather than throwing — a topic with a title is still a debatable topic.
 */
export function resolveTopicSeed(input: {
    seed?: ColiseumTopicSeed;
    newsAnchor?: ColiseumLinkSeedSource;
}): ColiseumTopicSeed {
    if (input.seed) return input.seed;
    if (input.newsAnchor) return newsAnchorToSeed(input.newsAnchor);
    return { kind: 'text' };
}
