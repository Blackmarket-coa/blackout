export const NATIVE_BRIDGE_EVENT_NAME = 'blackout:native-event';

export type NativeBridgeSource = 'mobile' | 'desktop' | 'web';

export type DeepLinkOpenedEvent = {
    type: 'deep_link_opened';
    source: NativeBridgeSource;
    url: string;
};

export type NotificationTokenEvent = {
    type: 'notification_token';
    source: NativeBridgeSource;
    token: string;
};

export type NotificationInteractedEvent = {
    type: 'notification_interacted';
    source: NativeBridgeSource;
    roomId: string;
    /**
     * Optional thread root event id. When the push payload identifies a
     * threaded message, the listener routes to the room *and* opens that
     * thread; absent, it falls back to room-level routing. End-to-end this
     * also requires the Sygnal push gateway to forward the thread id in the
     * FCM/APNs payload (see KNOWN_LIMITATIONS.md).
     */
    threadRootEventId?: string;
};

export type ResumeSyncEvent = {
    type: 'resume_sync';
    source: NativeBridgeSource;
};

export type UnreadCountChangedEvent = {
    type: 'unread_count_changed';
    source: NativeBridgeSource;
    unread: number;
};

export type NativeBridgeEvent =
    | DeepLinkOpenedEvent
    | NotificationTokenEvent
    | NotificationInteractedEvent
    | ResumeSyncEvent
    | UnreadCountChangedEvent;

export function dispatchNativeBridgeEvent(event: NativeBridgeEvent): void {
    globalThis.dispatchEvent(
        new CustomEvent<NativeBridgeEvent>(NATIVE_BRIDGE_EVENT_NAME, { detail: event })
    );
}

export function listenForNativeBridgeEvents(
    handler: (event: NativeBridgeEvent) => void
): () => void {
    const listener: EventListener = (event) => {
        const detail = (event as CustomEvent<NativeBridgeEvent>).detail;
        if (!detail || typeof detail !== 'object') return;
        if (!('type' in detail) || typeof detail.type !== 'string') return;
        handler(detail);
    };

    globalThis.addEventListener(NATIVE_BRIDGE_EVENT_NAME, listener);
    return () => {
        globalThis.removeEventListener(NATIVE_BRIDGE_EVENT_NAME, listener);
    };
}

export function extractRoomIdFromDeepLinkUrl(url?: string): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!['matrix:', 'blackout:'].includes(parsed.protocol)) return null;
        if (parsed.hostname === 'room' && parsed.pathname.length > 1) {
            return decodeURIComponent(parsed.pathname.slice(1));
        }
        const queryRoom =
            parsed.searchParams.get('room_id') ?? parsed.searchParams.get('roomId');
        return queryRoom?.trim() || null;
    } catch {
        return null;
    }
}
