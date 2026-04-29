import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    extractRoomIdFromDeepLinkUrl,
    listenForNativeBridgeEvents,
} from './native-bridge-contract';

export function NativeBridgeListener(): null {
    const navigate = useNavigate();

    useEffect(() => {
        return listenForNativeBridgeEvents((event) => {
            if (event.type === 'deep_link_opened') {
                const roomId = extractRoomIdFromDeepLinkUrl(event.url);
                if (!roomId) return;
                navigate(`/room/${encodeURIComponent(roomId)}`);
                return;
            }
            if (event.type === 'notification_interacted') {
                if (!event.roomId) return;
                navigate(`/room/${encodeURIComponent(event.roomId)}`);
            }
        });
    }, [navigate]);

    return null;
}
