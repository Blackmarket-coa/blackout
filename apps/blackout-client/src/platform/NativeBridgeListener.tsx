import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { listenForNativeBridgeEvents } from './native-bridge-contract';
import { resolveNotificationRoute } from './notification-routing';

export function NativeBridgeListener(): null {
    const navigate = useNavigate();

    useEffect(() => {
        return listenForNativeBridgeEvents((event) => {
            const target = resolveNotificationRoute(event);
            if (target) navigate(target);
        });
    }, [navigate]);

    return null;
}
