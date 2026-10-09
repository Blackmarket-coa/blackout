import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useAtomValue } from 'jotai';
import RoomTimeline from '../room/RoomTimeline';
import MessageComposer from '../room/MessageComposer';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { mDirectAtom } from '../../state/mDirectList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { EMBED_PATH } from '../../pages/paths';
import { buildEmbedCanopyPath, canonicalDenPath, canonicalDmPath } from './embedPaths';
import { classifyEmbedRoom, roomToEmbedFacts } from './embedScope';
import { decodeRouteId } from './EmbedCanopy';
import { EmbedNotShown } from './EmbedNotShown';
import { linkStyle } from './embedStyles';

type EmbedRoomRouteProps = {
    /** Which panel route matched; decides the back link and the "open in Blackout" target. */
    kind: 'den' | 'dm';
};

/**
 * A den or DM in the panel: its timeline and composer, and nothing else —
 * no call button, threads panel, member list, governance or room settings.
 * Text chat only (launch-plan precondition P4).
 *
 * The room is re-checked against the panel's scoping rule here, not only in
 * the lists, because a panel URL can name any room id.
 */
export const EmbedRoomRoute = ({ kind }: EmbedRoomRouteProps) => {
    const params = useParams<{ canopyId?: string; denId?: string; roomId?: string }>();
    const canopyId = decodeRouteId(params.canopyId);
    const roomId = decodeRouteId(kind === 'dm' ? params.roomId : params.denId);
    // The joined-room list (not `mx.getRoom`) so the page re-renders when the
    // room arrives from sync after a cold start.
    const joinedRooms = useAtomValue(joinedRoomsAtom);
    const directRoomIds = useAtomValue(mDirectAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const mx = useMatrixClient();

    const room = useMemo(
        () =>
            roomId ? joinedRooms.find((candidate) => candidate.roomId === roomId) ?? null : null,
        [joinedRooms, roomId]
    );
    const facts = useMemo(
        () => (room ? roomToEmbedFacts(room, directRoomIds, roomToParents.get(room.roomId)) : null),
        [room, directRoomIds, roomToParents]
    );
    const roomKind = facts ? classifyEmbedRoom(facts) : null;

    const openPath = roomId
        ? kind === 'dm'
            ? canonicalDmPath(roomId)
            : canonicalDenPath(canopyId, roomId)
        : '/';

    if (roomId && !room && !mx.isInitialSyncComplete()) {
        // Cold start: the room list is still loading, so "not available"
        // would be premature.
        return (
            <p data-testid="embed-room-loading" style={{ margin: 12, opacity: 0.8 }}>
                Loading…
            </p>
        );
    }

    if (!roomId || !facts || (roomKind !== 'den' && roomKind !== 'dm')) {
        return (
            <EmbedNotShown
                reason={
                    kind === 'dm'
                        ? "This conversation isn't available in the panel."
                        : `This ${BLACKOUT_TERMS.den.singular} isn't available in the panel.`
                }
                openPath={openPath}
            />
        );
    }

    const backTo = canopyId ? buildEmbedCanopyPath(canopyId) : EMBED_PATH;

    return (
        <div
            data-testid="embed-room"
            data-room-id={roomId}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
            <div
                style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderBottom: '1px solid var(--border-default, #374151)',
                }}
            >
                <Link to={backTo} style={{ ...linkStyle, fontSize: 13 }} aria-label="Back">
                    ←
                </Link>
                <strong
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {facts.name}
                </strong>
                <a
                    href={openPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-embed-open="tab"
                    style={{ ...linkStyle, fontSize: 13 }}
                    title="Open in Blackout"
                >
                    ↗
                </a>
            </div>
            <section style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <RoomTimeline roomId={roomId} />
            </section>
            <div style={{ padding: 8, borderTop: '1px solid var(--border-default, #374151)' }}>
                <MessageComposer roomId={roomId} />
            </div>
        </div>
    );
};

export default EmbedRoomRoute;
