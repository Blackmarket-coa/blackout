import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../state/rooms';

/**
 * Channel-kind marker for a den. Kept deliberately separate from the den
 * *classification* (`co.bmc.den.classification`, which encodes trust class:
 * public/coalition/private/ai) — a channel can be a voice channel regardless
 * of its trust class, exactly like Discord. Default is `text`.
 */
export const DEN_KIND_STATE_EVENT_TYPE = 'co.bmc.den.kind';

export type DenKind = 'text' | 'voice';

export interface DenKindContent {
    kind?: DenKind;
}

export const resolveDenKind = (content: DenKindContent | undefined): DenKind =>
    content?.kind === 'voice' ? 'voice' : 'text';

export const readDenKind = (room: Room | undefined): DenKind => {
    if (!room) return 'text';
    const content = room.currentState
        ?.getStateEvents(DEN_KIND_STATE_EVENT_TYPE, '')
        ?.getContent<DenKindContent>();
    return resolveDenKind(content && typeof content === 'object' ? content : undefined);
};

/**
 * Split a list of dens into text and voice channels, preserving input order
 * within each bucket. Pure helper so the channel sidebar's text/voice grouping
 * is independently testable.
 */
export const partitionDensByKind = (rooms: Room[]): { text: Room[]; voice: Room[] } => {
    const text: Room[] = [];
    const voice: Room[] = [];
    for (const room of rooms) {
        (readDenKind(room) === 'voice' ? voice : text).push(room);
    }
    return { text, voice };
};

/** Resolve a den's channel kind (text/voice) from its Matrix room state. */
export const useDenKind = (roomId: string | null): DenKind => {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return 'text';
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        return readDenKind(room);
    }, [roomId, rooms]);
};

const localDomain = (mx: MatrixClient): string[] => {
    const domain = mx.getDomain?.();
    return domain ? [domain] : [];
};

/**
 * Create a den inside a canopy and link it via Matrix space semantics
 * (`m.space.parent` on the den, `m.space.child` on the canopy), stamping the
 * channel kind so the server page can bucket it as a text or voice channel.
 * Returns the new den's room id. No `addRoomToSpace` helper exists in the
 * codebase, so the parent/child edges are written explicitly here.
 */
export const createDenInCanopy = async (
    mx: MatrixClient,
    {
        canopyId,
        name,
        kind = 'text',
        topic,
    }: { canopyId: string; name: string; kind?: DenKind; topic?: string }
): Promise<string> => {
    const via = localDomain(mx);
    const { room_id: roomId } = await mx.createRoom({
        name,
        topic,
        visibility: undefined,
    });

    // Custom + space state-event types aren't in matrix-js-sdk's typed
    // `StateEvents` map; cast the event type as the codebase does elsewhere
    // (see `useRoomAliases`).
    await mx.sendStateEvent(roomId, DEN_KIND_STATE_EVENT_TYPE as any, { kind }, '');
    await mx.sendStateEvent(roomId, 'm.space.parent' as any, { via, canonical: true }, canopyId);
    await mx.sendStateEvent(canopyId, 'm.space.child' as any, { via, suggested: true }, roomId);

    return roomId;
};
