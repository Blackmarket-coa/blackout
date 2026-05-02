/**
 * Discriminated union of citations attachable to a ColiseumArgument.
 * Each kind resolves to an existing blackout surface so Coliseum composes
 * (rather than reimplements) Lives, Town-halls, Subscriptions, Audio,
 * Articles, and Governance proposals.
 */
export type ColiseumCitation =
    | { kind: 'live'; roomId: string; eventId?: string }
    | { kind: 'townhall'; meetingId: string }
    | { kind: 'subscription'; subscriptionId: string }
    | { kind: 'audio'; mxc: string; durationMs?: number }
    | { kind: 'article'; sourceUrl: string; title: string; publishedAt?: string }
    | { kind: 'proposal'; proposalEventId: string };

export type ColiseumCitationKind = ColiseumCitation['kind'];

export const COLISEUM_CITATION_KINDS: readonly ColiseumCitationKind[] = [
    'live',
    'townhall',
    'subscription',
    'audio',
    'article',
    'proposal',
] as const;

const ROOM_ID_RE = /^![^:]+:[^:]+$/;
const MXC_RE = /^mxc:\/\/[^/]+\/[A-Za-z0-9_-]+$/;
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

export function isValidCitationKind(value: unknown): value is ColiseumCitationKind {
    return typeof value === 'string' && (COLISEUM_CITATION_KINDS as readonly string[]).includes(value);
}

/**
 * Validate a citation. Returns the citation untouched on success, or null if it
 * fails shape or basic identifier checks. Validation is intentionally permissive
 * on optional fields and strict on identifiers (Matrix room ids, mxc URIs, URLs).
 */
export function validateCitation(input: unknown): ColiseumCitation | null {
    if (!input || typeof input !== 'object') return null;
    const data = input as Record<string, unknown>;
    if (!isValidCitationKind(data.kind)) return null;

    switch (data.kind) {
        case 'live': {
            if (!isNonEmptyString(data.roomId) || !ROOM_ID_RE.test(data.roomId)) return null;
            const eventId = isNonEmptyString(data.eventId) ? data.eventId : undefined;
            return { kind: 'live', roomId: data.roomId, eventId };
        }
        case 'townhall': {
            if (!isNonEmptyString(data.meetingId)) return null;
            return { kind: 'townhall', meetingId: data.meetingId };
        }
        case 'subscription': {
            if (!isNonEmptyString(data.subscriptionId)) return null;
            return { kind: 'subscription', subscriptionId: data.subscriptionId };
        }
        case 'audio': {
            if (!isNonEmptyString(data.mxc) || !MXC_RE.test(data.mxc)) return null;
            const durationMs =
                typeof data.durationMs === 'number' && data.durationMs >= 0 ? data.durationMs : undefined;
            return { kind: 'audio', mxc: data.mxc, durationMs };
        }
        case 'article': {
            if (!isNonEmptyString(data.sourceUrl) || !HTTP_URL_RE.test(data.sourceUrl)) return null;
            if (!isNonEmptyString(data.title)) return null;
            const publishedAt = isNonEmptyString(data.publishedAt) ? data.publishedAt : undefined;
            return {
                kind: 'article',
                sourceUrl: data.sourceUrl,
                title: data.title.slice(0, 300),
                publishedAt,
            };
        }
        case 'proposal': {
            if (!isNonEmptyString(data.proposalEventId)) return null;
            return { kind: 'proposal', proposalEventId: data.proposalEventId };
        }
    }
}

export function validateCitations(input: unknown): ColiseumCitation[] {
    if (!Array.isArray(input)) return [];
    const out: ColiseumCitation[] = [];
    for (const candidate of input) {
        const validated = validateCitation(candidate);
        if (validated) out.push(validated);
    }
    return out;
}

/**
 * Citation depth bonus: more citations of distinct kinds → higher signal that
 * the argument is doing real work rather than asserting. Logarithmic so it
 * doesn't dominate the rank.
 */
export function citationDepthScore(citations: readonly ColiseumCitation[]): number {
    if (citations.length === 0) return 0;
    const distinctKinds = new Set(citations.map((c) => c.kind)).size;
    const breadth = distinctKinds / COLISEUM_CITATION_KINDS.length;
    const volume = Math.log1p(citations.length) / Math.log1p(8);
    const blended = 0.6 * breadth + 0.4 * volume;
    return blended > 1 ? 1 : blended < 0 ? 0 : blended;
}
