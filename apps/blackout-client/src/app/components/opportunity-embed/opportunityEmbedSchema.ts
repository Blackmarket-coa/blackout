/**
 * Matrix custom event used to embed FreeBlackMarket *opportunity* cards —
 * product opportunities, market-demand signals, and launch opportunities — onto
 * messages, canopy state, and the home feed. Namespaced under `co.bmc.*` like
 * the product-attachment event.
 *
 * Opportunity data is FBM-owned (price/demand/score live in FBM). Blackout only
 * *displays* what FBM posts into the event content — there is no opportunity
 * computation in this repo — so the card is rendered straight from the event,
 * with an optional deep link back to FBM.
 */

export const OPPORTUNITY_EVENT_TYPE = 'co.bmc.opportunity' as const;

export const OPPORTUNITY_KINDS = ['product_opportunity', 'market_demand', 'launch'] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export interface OpportunityRef {
    kind: OpportunityKind;
    title: string;
    /** Short description of the opportunity. */
    summary?: string;
    /** Headline metric FBM computed (e.g. "demand +38%", "score 82"). */
    metric?: string;
    /** Optional FBM provider + listing this opportunity points at. */
    providerId?: string;
    listingId?: string;
    /** Optional deep link back into FBM. */
    url?: string;
}

export interface OpportunityEventContent {
    /** Schema marker — must be `1` until breaking changes are introduced. */
    version: 1;
    opportunities: OpportunityRef[];
}

const isOpportunityKind = (value: unknown): value is OpportunityKind =>
    typeof value === 'string' && (OPPORTUNITY_KINDS as readonly string[]).includes(value);

/**
 * Defensive parser for arbitrary (federated, untrusted) event content. Returns
 * an empty `opportunities` array on a malformed payload so the renderer falls
 * back to a no-op render rather than crashing.
 */
export const parseOpportunityEvent = (raw: unknown): OpportunityEventContent => {
    if (!raw || typeof raw !== 'object') return { version: 1, opportunities: [] };
    const value = raw as Record<string, unknown>;
    const rawList = Array.isArray(value.opportunities) ? value.opportunities : [];

    const opportunities: OpportunityRef[] = [];
    for (const entry of rawList) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as Record<string, unknown>;
        const kind = isOpportunityKind(item.kind) ? item.kind : null;
        const title = typeof item.title === 'string' ? item.title : null;
        if (!kind || !title) continue;
        const ref: OpportunityRef = { kind, title };
        if (typeof item.summary === 'string') ref.summary = item.summary;
        if (typeof item.metric === 'string') ref.metric = item.metric;
        if (typeof item.providerId === 'string') ref.providerId = item.providerId;
        if (typeof item.listingId === 'string') ref.listingId = item.listingId;
        if (typeof item.url === 'string') ref.url = item.url;
        opportunities.push(ref);
    }

    return { version: 1, opportunities };
};

/** Builder for a well-formed event payload (max 8 cards per event). */
export const buildOpportunityEvent = (refs: OpportunityRef[]): OpportunityEventContent => ({
    version: 1,
    opportunities: refs.slice(0, 8),
});
