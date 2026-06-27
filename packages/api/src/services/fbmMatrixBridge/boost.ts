// Boost (Hype Train / Fundraiser Rally) state writer. FBM creates a boost and
// pushes contribution updates by re-writing the `co.bmc.boost` state event
// (state key = boostId) in the creator's room/Space; the in-room BoostBar reads
// it live over Matrix sync. FBM remains authoritative for the credits.
import {
    BOOST_EVENT_TYPE,
    isBoostEventContent,
    type BoostEventContent,
} from '@blackout/protocol';
import { defaultMatrixClient, type FbmBridgeMatrixClient } from './client';

export interface UpsertBoostInput {
    roomId: string;
    boost: BoostEventContent;
}

export type UpsertBoostResult =
    | { ok: true; matrixEventId: string }
    | { ok: false; reason: 'invalid_payload' | 'matrix_error' };

/**
 * Create or update a boost. Re-writing with the same `boostId` advances the bar
 * (e.g. a new `currentCents` after a contribution) in place.
 */
export async function upsertBoost(
    input: UpsertBoostInput,
    matrix: FbmBridgeMatrixClient = defaultMatrixClient,
): Promise<UpsertBoostResult> {
    if (!isBoostEventContent(input.boost)) {
        return { ok: false, reason: 'invalid_payload' };
    }
    const result = await matrix.sendStateEvent(
        input.roomId,
        BOOST_EVENT_TYPE,
        input.boost as unknown as Record<string, unknown>,
        input.boost.boostId,
    );
    if (!result.ok || !result.eventId) {
        return { ok: false, reason: 'matrix_error' };
    }
    return { ok: true, matrixEventId: result.eventId };
}

export interface ListedBoost {
    matrixEventId: string;
    boost: BoostEventContent;
}

/** Read every boost currently recorded in a room. */
export async function listBoosts(
    roomId: string,
    matrix: FbmBridgeMatrixClient = defaultMatrixClient,
): Promise<ListedBoost[]> {
    const state = await matrix.getRoomStateEvents(roomId, BOOST_EVENT_TYPE);
    if (!state.ok) return [];
    const boosts: ListedBoost[] = [];
    for (const event of state.events) {
        if (isBoostEventContent(event.content)) {
            boosts.push({ matrixEventId: event.eventId, boost: event.content });
        }
    }
    return boosts;
}
