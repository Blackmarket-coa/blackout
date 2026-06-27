// Smart Split Contract writer/reader. FBM calls Blackout to record a creator's
// revenue-split contract as an immutable Matrix state event in the creator's
// Space; the returned Matrix event id is the contract's canonical proof. FBM
// stays authoritative for settlement — this is the audit trail, not the ledger.
//
// Mirrors the bridge's injectable-client convention (see client.ts) so it can be
// unit-tested with a fake Matrix client.
import {
    SPLIT_CONTRACT_EVENT_TYPE,
    isSplitContractPayload,
    splitPercentagesAreValid,
    type SplitContractPayload,
} from '@blackout/protocol';
import { defaultMatrixClient, type FbmBridgeMatrixClient } from './client';

export interface ActivateSplitContractInput {
    spaceId: string;
    contract: SplitContractPayload;
}

export type ActivateSplitContractResult =
    | { ok: true; matrixEventId: string }
    | { ok: false; reason: 'invalid_payload' | 'invalid_split' | 'matrix_error' };

/**
 * Write a split contract as a `co.bmc.split_contract` state event
 * (state key = `contractId`). Re-activating with the same id supersedes the
 * prior version in place; "archiving" is just an activate with
 * `status: 'archived'`. Every version survives in room history.
 */
export async function activateSplitContract(
    input: ActivateSplitContractInput,
    matrix: FbmBridgeMatrixClient = defaultMatrixClient,
): Promise<ActivateSplitContractResult> {
    if (!isSplitContractPayload(input.contract)) {
        // isSplitContractPayload already enforces the 100% sum, but distinguish
        // the common "shares don't add up" case for a clearer 4xx upstream.
        if (
            input.contract &&
            Array.isArray((input.contract as SplitContractPayload).parties) &&
            !splitPercentagesAreValid((input.contract as SplitContractPayload).parties)
        ) {
            return { ok: false, reason: 'invalid_split' };
        }
        return { ok: false, reason: 'invalid_payload' };
    }

    const result = await matrix.sendStateEvent(
        input.spaceId,
        SPLIT_CONTRACT_EVENT_TYPE,
        input.contract as unknown as Record<string, unknown>,
        input.contract.contractId,
    );

    if (!result.ok || !result.eventId) {
        return { ok: false, reason: 'matrix_error' };
    }
    return { ok: true, matrixEventId: result.eventId };
}

export interface ListedSplitContract {
    matrixEventId: string;
    contract: SplitContractPayload;
}

/**
 * Read every split contract currently recorded in a Space. Invalid/foreign
 * state events are skipped rather than throwing.
 */
export async function listSplitContracts(
    spaceId: string,
    matrix: FbmBridgeMatrixClient = defaultMatrixClient,
): Promise<ListedSplitContract[]> {
    const state = await matrix.getRoomStateEvents(spaceId, SPLIT_CONTRACT_EVENT_TYPE);
    if (!state.ok) return [];
    const contracts: ListedSplitContract[] = [];
    for (const event of state.events) {
        if (isSplitContractPayload(event.content)) {
            contracts.push({ matrixEventId: event.eventId, contract: event.content });
        }
    }
    return contracts;
}
