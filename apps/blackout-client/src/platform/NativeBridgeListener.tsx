import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildCommunitiesPath } from '../app/pages/paths';
import {
    extractRoomIdFromDeepLinkUrl,
    listenForNativeBridgeEvents,
} from './native-bridge-contract';

const buildRoomTarget = (roomId: string, threadRootEventId?: string): string => {
    const base = buildCommunitiesPath(null, roomId);
    if (!threadRootEventId) return base;
    // `?thread=` opens the thread panel on the root (consumed by
    // CommunitiesRoute → activeThreadRootIdAtom); `?event=` jumps the timeline
    // to that message, mirroring the navigateRoom convention.
    const id = encodeURIComponent(threadRootEventId);
    return `${base}?thread=${id}&event=${id}`;
};

export function NativeBridgeListener(): null {
    const navigate = useNavigate();

    useEffect(() => {
        return listenForNativeBridgeEvents((event) => {
            if (event.type === 'deep_link_opened') {
                const roomId = extractRoomIdFromDeepLinkUrl(event.url);
                if (!roomId) return;
                navigate(buildRoomTarget(roomId));
                return;
            }
            if (event.type === 'notification_interacted') {
                if (!event.roomId) return;
                navigate(buildRoomTarget(event.roomId, event.threadRootEventId));
            }
        });
    }, [navigate]);

    return null;
}
