import {
    ROUND_CLOSED_EVENT_TYPE,
    ROUND_OPENED_EVENT_TYPE,
    ROUNDS_SCHEMA_VERSION,
    type RoundClosedPayload,
    type RoundOpenedPayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

/**
 * Matrix-side writer for rounds. Round-opened is a *timeline* event (not
 * state) so it threads naturally alongside conversation; contributions are
 * normal `m.room.message` events with an `m.in_reply_to` relation back to
 * the opening event. Closing a round is a sibling timeline event; clients
 * pair them up by `roundId`.
 */
export const createRoundsMatrixActions = (client: MatrixEventClient) => ({
    openRound: async (roomId: string, payload: RoundOpenedPayload) =>
        client.sendEvent(roomId, ROUND_OPENED_EVENT_TYPE as never, {
            ...payload,
            schemaVersion: ROUNDS_SCHEMA_VERSION,
        } as never),
    closeRound: async (roomId: string, payload: RoundClosedPayload) =>
        client.sendEvent(roomId, ROUND_CLOSED_EVENT_TYPE as never, {
            ...payload,
            schemaVersion: ROUNDS_SCHEMA_VERSION,
        } as never),
});
