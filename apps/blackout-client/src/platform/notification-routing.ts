import { buildCommunitiesPath } from '../app/pages/paths';
import {
    extractRoomIdFromDeepLinkUrl,
    type NativeBridgeEvent,
    type NativeBridgeSource,
    type NotificationInteractedEvent,
} from './native-bridge-contract';

/**
 * Single source of truth for turning a native-shell notification / deep-link
 * into an in-app route. Both the mobile (Capacitor) and desktop (Tauri) shells
 * funnel their platform payloads through here, and the `NativeBridgeListener`
 * navigates to whatever this resolves — so the mobile and desktop harnesses can
 * assert the same routing the real app uses without a device in the loop.
 */

/** Build the room route, optionally opening a thread panel on a root event. */
export function buildRoomTarget(roomId: string, threadRootEventId?: string): string {
    const base = buildCommunitiesPath(null, roomId);
    if (!threadRootEventId) return base;
    // `?thread=` opens the thread panel on the root (consumed by
    // CommunitiesRoute → activeThreadRootIdAtom); `?event=` jumps the timeline
    // to that message, mirroring the navigateRoom convention.
    const id = encodeURIComponent(threadRootEventId);
    return `${base}?thread=${id}&event=${id}`;
}

/**
 * Resolve a bridge event to a route, or `null` when it shouldn't navigate
 * (unknown event kind, unresolvable deep link, or a notification with no room).
 */
export function resolveNotificationRoute(event: NativeBridgeEvent): string | null {
    if (event.type === 'deep_link_opened') {
        const roomId = extractRoomIdFromDeepLinkUrl(event.url);
        return roomId ? buildRoomTarget(roomId) : null;
    }
    if (event.type === 'notification_interacted') {
        return event.roomId ? buildRoomTarget(event.roomId, event.threadRootEventId) : null;
    }
    return null;
}

/**
 * The push-payload data bag a notification tap carries. Mirrors what Sygnal
 * forwards through FCM/APNs (and the Tauri notification bridge): a `room_id`
 * and, when the message is threaded, a `thread_root_event_id`.
 */
export interface RawNotificationData {
    room_id?: string;
    thread_root_event_id?: string;
    [key: string]: unknown;
}

/**
 * Map a raw notification-tap data bag to a `notification_interacted` event, or
 * `null` when there is no room to route to. Shared by the mobile and desktop
 * bridges so the payload → event contract is defined once.
 */
export function notificationDataToInteractedEvent(
    data: RawNotificationData | undefined,
    source: NativeBridgeSource
): NotificationInteractedEvent | null {
    if (!data?.room_id) return null;
    return {
        type: 'notification_interacted',
        source,
        roomId: data.room_id,
        threadRootEventId: data.thread_root_event_id || undefined,
    };
}
