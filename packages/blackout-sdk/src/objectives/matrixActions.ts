import {
    DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE,
    DEN_OBJECTIVE_EVENT_TYPE,
    OBJECTIVE_SCHEMA_VERSION,
    type DenObjectiveContributionPayload,
    type DenObjectivePayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

/**
 * Matrix-side writers for den shared objectives.
 *
 * `setObjective` writes the objective definition as a state event keyed by
 * `objectiveId` (re-writing the same key edits status — `active` → `met` /
 * `archived` — title, target, etc.). `contribute` appends a timeline event:
 * a single logged increment. Progress is derived on read by folding the
 * contribution timeline; this writer never tracks per-member totals.
 */
export const createObjectiveMatrixActions = (client: MatrixEventClient) => ({
    setObjective: async (roomId: string, content: DenObjectivePayload) =>
        client.sendStateEvent(
            roomId,
            DEN_OBJECTIVE_EVENT_TYPE,
            { ...content, schemaVersion: OBJECTIVE_SCHEMA_VERSION },
            content.objectiveId,
        ),
    contribute: async (roomId: string, payload: DenObjectiveContributionPayload) =>
        client.sendEvent(roomId, DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE, {
            ...payload,
            schemaVersion: OBJECTIVE_SCHEMA_VERSION,
        }),
});
