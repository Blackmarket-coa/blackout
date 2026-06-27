/**
 * Bounty-board room contracts.
 *
 * Two pieces:
 *  1. `co.bmc.room_type` — a room-shape marker (state key ""). When its `type`
 *     is `bounty_board`, the client renders the room as a structured bounty
 *     board instead of a chat timeline.
 *  2. `co.bmc.bounty` — one state event per bounty (state key = bountyId). This
 *     is the immutable Matrix *audit trail*; FBM (`bountyClient` / the bounties
 *     API) remains the authoritative store. The content mirrors the essential
 *     fields of `@blackout/core`'s `Bounty` (kept self-contained so the protocol
 *     package stays dependency-free); status transitions are new state events
 *     with the same key.
 */

export const ROOM_TYPE_EVENT_TYPE = 'co.bmc.room_type' as const;
export const BOUNTY_EVENT_TYPE = 'co.bmc.bounty' as const;

export const ROOM_TYPES = ['bounty_board', 'broadcast', 'chat'] as const;
export type RoomTypeValue = (typeof ROOM_TYPES)[number];

export interface RoomTypeContent {
    type: RoomTypeValue;
}

export const isRoomTypeValue = (value: unknown): value is RoomTypeValue =>
    typeof value === 'string' && (ROOM_TYPES as readonly string[]).includes(value);

export const isRoomTypeContent = (value: unknown): value is RoomTypeContent =>
    !!value && typeof value === 'object' && isRoomTypeValue((value as RoomTypeContent).type);

/** Convenience: is this `co.bmc.room_type` content a bounty board? */
export const isBountyBoardRoomType = (value: unknown): boolean =>
    isRoomTypeContent(value) && value.type === 'bounty_board';

export const BOUNTY_STATE_STATUSES = ['open', 'in_progress', 'complete', 'cancelled'] as const;
export type BountyStateStatus = (typeof BOUNTY_STATE_STATUSES)[number];

export interface BountyStateContent {
    bountyId: string;
    title: string;
    description: string;
    /** Human-readable reward, e.g. "$50", "10% rev-share". */
    rewardSummary: string;
    /** Optional structured amount for cash/credit rewards, minor units. */
    rewardAmountCents?: number;
    status: BountyStateStatus;
    /** Poster's Matrix id. */
    creatorId: string;
    /** Matrix id of whoever claimed it, once claimed. */
    claimedBy?: string;
    /** Optional ISO-8601 deadline. */
    deadline?: string;
    createdAt: string;
}

export const isBountyStateStatus = (value: unknown): value is BountyStateStatus =>
    typeof value === 'string' && (BOUNTY_STATE_STATUSES as readonly string[]).includes(value);

export const isBountyStateContent = (value: unknown): value is BountyStateContent => {
    if (!value || typeof value !== 'object') return false;
    const b = value as Record<string, unknown>;
    if (typeof b.bountyId !== 'string' || b.bountyId.length === 0) return false;
    if (typeof b.title !== 'string' || b.title.length === 0) return false;
    if (typeof b.description !== 'string') return false;
    if (typeof b.rewardSummary !== 'string') return false;
    if (
        b.rewardAmountCents !== undefined &&
        (typeof b.rewardAmountCents !== 'number' || !Number.isFinite(b.rewardAmountCents))
    ) {
        return false;
    }
    if (!isBountyStateStatus(b.status)) return false;
    if (typeof b.creatorId !== 'string' || b.creatorId.length === 0) return false;
    if (b.claimedBy !== undefined && typeof b.claimedBy !== 'string') return false;
    if (b.deadline !== undefined && typeof b.deadline !== 'string') return false;
    if (typeof b.createdAt !== 'string') return false;
    return true;
};
