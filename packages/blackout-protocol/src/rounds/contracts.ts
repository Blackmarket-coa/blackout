/**
 * Round contracts.
 *
 * A "round" is a sociocratic turn-based prompt: the facilitator opens a
 * round with a question, every member's voice is then a reply to that
 * message (any msgtype, including voice notes via `org.matrix.msc3245.voice`).
 * The UI exposes three avatar rows under the round message — yet-to-speak,
 * speaking-now, spoken — so silence is visible without shaming anyone.
 *
 * The brief is firm that rounds *should look like gentle conversational
 * rituals*, not a separate forms layer. So we ride on top of standard
 * `m.room.message` semantics: replies thread via `m.in_reply_to`, voice
 * messages use the established MSC3245 marker, and our event only carries
 * the prompt + a small amount of round-specific metadata.
 *
 * `allowVoice` defaults to true at the catalog level (per playbook) but
 * can be overridden per round — Order playbooks often turn it off.
 * `deadline` is optional; a round may stay open indefinitely until the
 * facilitator closes it.
 */

import type { EventEnvelope } from '../common/types';

export const ROUNDS_PROTOCOL_VERSION = 1 as const;

export const ROUND_STATUSES = ['open', 'closed', 'cancelled'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export interface RoundOpenedPayload {
    /** Stable id used to correlate this round with its contributions and close event. */
    roundId: string;
    /** The prompt the facilitator is asking the circle to answer. */
    prompt: string;
    /** Whether voice-note replies should be the suggested input. */
    allowVoice: boolean;
    /** Matrix user id of the facilitator who opened the round. */
    facilitator: string;
    /** Optional ISO-8601 deadline; the UI surfaces it but doesn't enforce. */
    deadline?: string;
    /** Optional list of explicit invitees (Matrix user ids). Empty = the room. */
    invitees?: string[];
    /** Open / closed / cancelled. Newly-opened rounds default to 'open'. */
    status: RoundStatus;
}

export interface RoundClosedPayload {
    roundId: string;
    /** ISO-8601 timestamp the round was closed. */
    closedAt: string;
    /** Matrix user id who closed the round (usually the facilitator). */
    closedBy: string;
}

export const isRoundStatus = (value: unknown): value is RoundStatus =>
    typeof value === 'string' && (ROUND_STATUSES as readonly string[]).includes(value);

export const isRoundOpenedPayload = (value: unknown): value is RoundOpenedPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.roundId !== 'string') return false;
    if (typeof p.prompt !== 'string') return false;
    if (typeof p.allowVoice !== 'boolean') return false;
    if (typeof p.facilitator !== 'string') return false;
    if (!isRoundStatus(p.status)) return false;
    if (p.deadline !== undefined && typeof p.deadline !== 'string') return false;
    if (p.invitees !== undefined && !Array.isArray(p.invitees)) return false;
    return true;
};

export type RoundOpenedEvent = EventEnvelope<
    'blackout.governance.round.opened',
    RoundOpenedPayload
>;

export type RoundClosedEvent = EventEnvelope<
    'blackout.governance.round.closed',
    RoundClosedPayload
>;

export interface RoundsProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof ROUNDS_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const ROUNDS_PROTOCOL_SURFACE: RoundsProtocolSurface = {
    owner: '@blackout/protocol',
    version: ROUNDS_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};
