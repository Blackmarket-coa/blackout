/**
 * In-room tip event contract (Coalition Credits / creator tips surfaced in chat).
 *
 * A tip is settled by the FBM tips API (the authoritative ledger). To surface it
 * in the room timeline, Blackout posts an `m.room.message` (msgtype `m.notice`)
 * carrying a structured block under the `co.bmc.tip` content key — the same
 * embed-with-plaintext-fallback convention the marketplace bridge uses, so
 * non-Blackout clients still see the plain `body`. The client detects the block
 * and renders a rich tip card.
 */

export const TIP_EVENT_TYPE = 'co.bmc.tip' as const;

/** Bumped when the `co.bmc.tip` content shape changes incompatibly. */
export const TIP_EVENT_SCHEMA_VERSION = 1 as const;

export interface TipEventContent {
    schemaVersion: number;
    /** The FBM tip id this event mirrors. */
    tipId: string;
    /** Tipper's Matrix id. */
    fromMxid: string;
    /** Recipient's Matrix id. */
    toMxid: string;
    /** Amount in minor units (e.g. cents). */
    amountCents: number;
    /** ISO-4217 currency code. */
    currency: string;
    /** Optional free-text note from the tipper. */
    note?: string;
    /** ISO-8601 timestamp the tip was sent. */
    occurredAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const isTipEventContent = (value: unknown): value is TipEventContent => {
    if (!isRecord(value)) return false;
    if (typeof value.schemaVersion !== 'number') return false;
    if (typeof value.tipId !== 'string' || value.tipId.length === 0) return false;
    if (typeof value.fromMxid !== 'string' || value.fromMxid.length === 0) return false;
    if (typeof value.toMxid !== 'string' || value.toMxid.length === 0) return false;
    if (
        typeof value.amountCents !== 'number' ||
        !Number.isFinite(value.amountCents) ||
        value.amountCents <= 0
    ) {
        return false;
    }
    if (typeof value.currency !== 'string' || value.currency.length === 0) return false;
    if (value.note !== undefined && typeof value.note !== 'string') return false;
    if (typeof value.occurredAt !== 'string') return false;
    return true;
};

/** Build a `co.bmc.tip`-bearing `m.notice` message content with a plaintext fallback. */
export const buildTipMessageContent = (
    tip: TipEventContent,
): Record<string, unknown> => ({
    msgtype: 'm.notice',
    body: `🎁 ${tip.fromMxid} tipped ${tip.toMxid} ${(tip.amountCents / 100).toFixed(2)} ${tip.currency}`,
    [TIP_EVENT_TYPE]: tip,
});
