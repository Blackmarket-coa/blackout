import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildCommunitiesPath } from '../app/pages/paths';
import {
    extractRoomIdFromDeepLinkUrl,
    listenForNativeBridgeEvents,
} from './native-bridge-contract';

const buildRoomTarget = (roomId: string): string => buildCommunitiesPath(null, roomId);

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
                navigate(buildRoomTarget(event.roomId));
            }
        });
    }, [navigate]);

    return null;
}
