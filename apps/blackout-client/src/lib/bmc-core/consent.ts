/**
 * Consent tally for sociocratic proposals.
 *
 * Consent proposals ride on Matrix's existing `m.reaction` mechanism: a
 * three-emoji palette (🌱 / 🌾 / 🪨) carries the choice space. No new event
 * type. The brief's S3 framing — "good enough for now, safe enough to try" —
 * lives in the copy; the tally lives here.
 *
 * Semantics:
 *   • 🌱 — safe to try (a consent). Counts toward quorum.
 *   • 🌾 — concern. Counted separately; does *not* block.
 *   • 🪨 — paramount objection. Any one of these blocks the proposal until
 *     the circle resolves the harm raised.
 *
 * The deadline rule (in useProposalResult) is: pass when (deadline reached)
 * AND (no 🪨) AND (consents ≥ quorum). The UI surfaces the blocked state
 * immediately so the proposer can iterate, but computedStatus only commits
 * `failed` at deadline.
 *
 * Data shape is Polis-compatible by design (per the plan's v2 defer note):
 * each reaction is a `(reactorId, stance)` tuple, easily aggregated into a
 * cluster matrix later.
 */

export const CONSENT_KEYS = ['🌱', '🌾', '🪨'] as const;
export type ConsentKey = (typeof CONSENT_KEYS)[number];

export const isConsentKey = (value: unknown): value is ConsentKey =>
    typeof value === 'string' && (CONSENT_KEYS as readonly string[]).includes(value);

export interface ConsentReaction {
    /** Matrix user id of the reactor. */
    reactorId: string;
    /** Reaction emoji. Only the three consent keys are tallied. */
    key: ConsentKey;
    /** Matrix event id of the reaction event (used to deduplicate). */
    eventId: string;
    /** Reaction timestamp in ms since epoch; latest wins per reactor. */
    timestamp: number;
    /** Optional note attached to the reaction (concern body / objection harm). */
    note?: string;
}

export interface ConsentConcernEntry {
    reactorId: string;
    eventId: string;
    timestamp: number;
    note?: string;
}

export interface ConsentObjectionEntry extends ConsentConcernEntry {}

export interface ConsentTally {
    /** Count of unique reactors whose latest reaction is 🌱. */
    consents: number;
    /** Reactors whose latest reaction is 🌾, sorted by recency. */
    concerns: ConsentConcernEntry[];
    /** Reactors whose latest reaction is 🪨, sorted by recency. */
    objections: ConsentObjectionEntry[];
    /** True iff there is at least one outstanding paramount objection. */
    blocked: boolean;
    /** Total unique reactors expressing any stance — useful for quorum math. */
    totalReactors: number;
}

const EMPTY_TALLY: ConsentTally = {
    consents: 0,
    concerns: [],
    objections: [],
    blocked: false,
    totalReactors: 0,
};

/**
 * Pure tally. Deduplicates by reactor (latest timestamp wins), then groups by
 * key. Concerns and objections are returned newest-first so the UI surfaces
 * the most recent voice at the top of the list.
 */
export function tallyConsent(
    reactions: ReadonlyArray<ConsentReaction>,
): ConsentTally {
    if (reactions.length === 0) return EMPTY_TALLY;

    const latestByReactor = new Map<string, ConsentReaction>();
    for (const reaction of reactions) {
        if (!isConsentKey(reaction.key)) continue;
        const existing = latestByReactor.get(reaction.reactorId);
        if (!existing || reaction.timestamp > existing.timestamp) {
            latestByReactor.set(reaction.reactorId, reaction);
        }
    }

    let consents = 0;
    const concerns: ConsentConcernEntry[] = [];
    const objections: ConsentObjectionEntry[] = [];

    for (const reaction of latestByReactor.values()) {
        if (reaction.key === '🌱') {
            consents += 1;
            continue;
        }
        const entry: ConsentConcernEntry = {
            reactorId: reaction.reactorId,
            eventId: reaction.eventId,
            timestamp: reaction.timestamp,
            note: reaction.note,
        };
        if (reaction.key === '🌾') concerns.push(entry);
        else if (reaction.key === '🪨') objections.push(entry);
    }

    concerns.sort((a, b) => b.timestamp - a.timestamp);
    objections.sort((a, b) => b.timestamp - a.timestamp);

    return {
        consents,
        concerns,
        objections,
        blocked: objections.length > 0,
        totalReactors: latestByReactor.size,
    };
}

/**
 * Decision predicate for `useProposalResult`'s consent branch. A consent
 * proposal passes iff:
 *   1. The deadline has been reached;
 *   2. No paramount objection is outstanding;
 *   3. Consent reactors meet the quorum.
 *
 * Returns the same shape as the vote-based result for back-compat with
 * existing renderers — 'active' until deadline, then 'passed' or 'failed'.
 */
export function deriveConsentStatus(input: {
    tally: ConsentTally;
    quorum: number;
    deadlineMs: number;
    nowMs: number;
}): 'active' | 'passed' | 'failed' {
    const { tally, quorum, deadlineMs, nowMs } = input;
    if (!Number.isFinite(deadlineMs) || nowMs < deadlineMs) return 'active';
    if (tally.blocked) return 'failed';
    return tally.consents >= quorum ? 'passed' : 'failed';
}
