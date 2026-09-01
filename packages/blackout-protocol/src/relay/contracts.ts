/**
 * Relay contract — the chain-repost behind the Circle/Reach feed.
 *
 * A relay is one person vouching for one thing to their own Circle. UI copy
 * calls the action "Boost"; the wire name is **relay** because `co.bmc.boost`
 * is already the fundraiser/hype-train state event (see `../boost`) and
 * `communityBoosts` is the paid-pledge flow. Three different concepts, one
 * English word — the protocol keeps them apart.
 *
 * Unlike `co.bmc.boost`, a relay is not room state: relays are edges in a
 * per-user graph owned by the API (`relay_edges`, migration 085), and this
 * contract is the shape the client and server agree on when exchanging them.
 * The event type is reserved for federating relays later.
 */

export const RELAY_EVENT_TYPE = 'co.bmc.relay' as const;

export const RELAY_SCHEMA_VERSION = 1 as const;

/**
 * What a relay may point at. Every member is resolvable server-side, so a
 * relayed item can be rendered for a viewer who has no other route to it.
 *
 * Encrypted den/room content is deliberately absent: the server cannot resolve
 * a room event for someone outside the room, and will not try. Clients hide the
 * relay affordance on den content rather than letting the call fail.
 */
export const RELAY_SUBJECT_SOURCES = [
    'coalition_feed',
    'coliseum_topic',
    'wall_post',
    'status',
    'marketplace',
    'stream',
    'community_asset',
] as const;
export type RelaySubjectSource = typeof RELAY_SUBJECT_SOURCES[number];

export const isRelaySubjectSource = (value: unknown): value is RelaySubjectSource =>
    typeof value === 'string' && (RELAY_SUBJECT_SOURCES as readonly string[]).includes(value);

/** One hop, as rendered in a visible `[You] → [X] → [Y]` path. */
export interface RelayHopContent {
    relayId: string;
    userId: string;
    displayName?: string;
    /** Optional relay commentary ("relaying because—"). */
    note: string | null;
    /**
     * False once this relayer has withdrawn. The hop is still shown: a chain
     * with a hole in it would misrepresent how the item actually travelled.
     */
    active: boolean;
    at: string;
}

export interface RelayContent {
    schemaVersion: number;
    relayId: string;
    subjectSource: RelaySubjectSource;
    subjectId: string;
    /** The edge the relayer saw it through; null when relayed from the origin. */
    parentRelayId: string | null;
    rootRelayId: string;
    /** 0 at the origin relay. */
    chainDepth: number;
    originAuthorId: string | null;
    note: string | null;
    active: boolean;
    createdAt: string;
}
