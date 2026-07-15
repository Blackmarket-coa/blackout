// Live interactions around a watch party: floating emoji reactions and
// host-control requests. Both ride ordinary room timeline events (default
// power level 0) so every member can participate, unlike the party state
// event itself which is host/moderator-gated. Pure helpers here; the
// timeline subscription lives in useWatchPartyLive.

export const WATCH_PARTY_REACTION_EVENT_TYPE = 'co.bmc.watch_party.reaction';
export const WATCH_PARTY_REQUEST_EVENT_TYPE = 'co.bmc.watch_party.control_request';

/**
 * Fixed reaction palette. Only these keys render as floating bursts —
 * arbitrary sender-controlled text must never float over the player.
 */
export const WATCH_PARTY_REACTION_KEYS = ['🎉', '😂', '😮', '😢', '🔥', '👏', '❤️', '👀'] as const;

export type WatchPartyReactionKey = typeof WATCH_PARTY_REACTION_KEYS[number];

/** How long a reaction burst stays on screen. */
export const REACTION_BURST_TTL_MS = 3000;
/** Most bursts kept at once; older ones drop first under reaction storms. */
export const REACTION_BURST_MAX = 30;
/** Minimum gap between the local user's own reaction sends. */
export const REACTION_SEND_THROTTLE_MS = 500;

/** Control requests older than this stop showing in the host's queue. */
export const CONTROL_REQUEST_TTL_MS = 10 * 60_000;

export const parseReactionKey = (
    content: Record<string, unknown> | undefined | null
): WatchPartyReactionKey | null => {
    const key = content?.key;
    const match = WATCH_PARTY_REACTION_KEYS.find((k) => k === key);
    return match ?? null;
};

export interface ReactionBurst {
    id: string;
    key: WatchPartyReactionKey;
    senderId: string;
}

export const appendBurst = (bursts: ReactionBurst[], burst: ReactionBurst): ReactionBurst[] => {
    const next = [...bursts, burst];
    return next.length > REACTION_BURST_MAX ? next.slice(next.length - REACTION_BURST_MAX) : next;
};

export interface TimelineEventLike {
    type: string;
    sender: string;
    originServerTs: number;
}

/**
 * Distill the host's pending control-request queue from timeline events:
 * recent requests only, deduped by sender (latest wins), never the host,
 * ordered oldest-first so the longest-waiting member is on top.
 */
export const collectControlRequests = (
    events: TimelineEventLike[],
    hostId: string,
    nowTs: number
): string[] => {
    const latestBySender = new Map<string, number>();
    for (const event of events) {
        if (event.type !== WATCH_PARTY_REQUEST_EVENT_TYPE) continue;
        if (!event.sender || event.sender === hostId) continue;
        if (nowTs - event.originServerTs > CONTROL_REQUEST_TTL_MS) continue;
        const seen = latestBySender.get(event.sender);
        if (seen === undefined || event.originServerTs > seen) {
            latestBySender.set(event.sender, event.originServerTs);
        }
    }
    return [...latestBySender.entries()].sort((a, b) => a[1] - b[1]).map(([sender]) => sender);
};
