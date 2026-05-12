/**
 * Compost contract.
 *
 * "Compost" is Blackout's archive-with-dignity affordance for governance-
 * active dens. Where Cinny/Discord/Slack offer Leave/Delete, governance
 * dens get Compost — the room is left but a `co.bmc.den.compost` state
 * event remains so the parent canopy can render the lineage. The brief is
 * firm that an ended den is *renewal*, not *failure*: composted dens fade
 * to a muted brown in the sidebar (phenology phase = compost), not red.
 *
 * Stored as a single empty-state-key room state event so it never collides
 * with rolling state — composting is final once written, with subsequent
 * edits captured by `updatedAt`. Casual playbooks bypass this entirely and
 * use the existing Leave path.
 */

import type { EventEnvelope } from '../common/types';

export const COMPOST_PROTOCOL_VERSION = 1 as const;

export interface CompostPayload {
    /** Matrix user id who initiated the compost. */
    initiator: string;
    /** Free-form reason — the brief frames this as "what we learned". */
    reason?: string;
    /** ISO-8601 timestamp the den was composted. */
    occurredAt: string;
    /** ISO-8601 timestamp of the last edit (initial = occurredAt). */
    updatedAt: string;
}

export const isCompostPayload = (value: unknown): value is CompostPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.initiator !== 'string') return false;
    if (typeof p.occurredAt !== 'string') return false;
    if (typeof p.updatedAt !== 'string') return false;
    if (p.reason !== undefined && typeof p.reason !== 'string') return false;
    return true;
};

export type CompostEvent = EventEnvelope<'blackout.den.composted', CompostPayload>;

export interface CompostProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof COMPOST_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const COMPOST_PROTOCOL_SURFACE: CompostProtocolSurface = {
    owner: '@blackout/protocol',
    version: COMPOST_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};
