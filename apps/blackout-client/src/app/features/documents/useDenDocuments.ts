import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    DEN_DOCUMENT_EVENT_TYPE,
    isDenDocumentPayload,
    type DenDocumentPayload,
} from '@blackout/protocol';
import { createDocumentsMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';

export interface DenDocumentModel extends DenDocumentPayload {
    /** Matrix event id of the state event carrying this document. */
    eventId: string;
}

function readDocumentPayloads(room: Room | undefined): DenDocumentModel[] {
    if (!room) return [];
    const eventsRaw = room.currentState?.getStateEvents(DEN_DOCUMENT_EVENT_TYPE);
    const events = Array.isArray(eventsRaw) ? eventsRaw : eventsRaw ? [eventsRaw] : [];
    const result: DenDocumentModel[] = [];
    for (const event of events) {
        const content = event.getContent<Record<string, unknown>>();
        if (!isDenDocumentPayload(content)) continue;
        result.push({
            ...content,
            eventId: event.getId() ?? `${event.getTs()}-${content.docId}`,
        });
    }
    return result;
}

/**
 * Hook: read every founding-document state event on a den. Sorted by
 * title for stable rendering; consumers can filter by `derivedFromTemplateId`
 * if they want to badge seeded vs hand-authored docs.
 */
export const useDenDocuments = (roomId: string | null | undefined): DenDocumentModel[] => {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return [];
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        const docs = readDocumentPayloads(room);
        docs.sort((a, b) => a.title.localeCompare(b.title));
        return docs;
    }, [roomId, rooms]);
};

/**
 * Hook: build a roomId-agnostic upserter. Returns a stable callback that
 * takes both `roomId` and the payload — used by the Plant flow where the
 * roomId isn&apos;t known until after `createRoom` resolves.
 */
export const useUpsertAnyDocument = () => {
    const client = useMatrixClient();
    const actions = useMemo(
        () =>
            createDocumentsMatrixActions({
                sendEvent: (rid, et, content) =>
                    client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async (roomId: string, payload: DenDocumentPayload) => {
            await actions.upsertDocument(roomId, payload);
        },
        [actions],
    );
};

/**
 * Hook: write a document state event. Upsert semantics — the caller
 * supplies the full `DenDocumentPayload`; Matrix's native state-event
 * history retains versions.
 */
export const useUpsertDocument = (roomId: string | null | undefined) => {
    const client = useMatrixClient();
    const actions = useMemo(
        () =>
            createDocumentsMatrixActions({
                sendEvent: (rid, et, content) =>
                    client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async (payload: DenDocumentPayload) => {
            if (!roomId) throw new Error('useUpsertDocument: roomId is required');
            await actions.upsertDocument(roomId, payload);
        },
        [actions, roomId],
    );
};
