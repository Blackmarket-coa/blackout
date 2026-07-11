import test from 'node:test';
import assert from 'node:assert/strict';

// Harness: proves a Tauri desktop notification / deep-link routes to the
// correct in-app location, without the Rust/Tauri runtime in the loop. The
// desktop shell delivers deep links through `initDesktopBridge` (which emits
// `deep_link_opened`) and — for a notification carrying room data — the shared
// `notificationDataToInteractedEvent` mapping. Both funnel through the same
// `resolveNotificationRoute` the app applies on the client side. Covers: room
// without thread, room with thread, and an invalid/absent room id.
import {
    notificationDataToInteractedEvent,
    resolveNotificationRoute,
    type RawNotificationData,
} from '../../apps/blackout-client/src/platform/notification-routing';
import { buildCommunitiesPath } from '../../apps/blackout-client/src/app/pages/paths';

/** A desktop notification tap carrying the same data bag Sygnal forwards. */
const routeForNotification = (data: RawNotificationData | undefined): string | null => {
    const event = notificationDataToInteractedEvent(data, 'desktop');
    return event ? resolveNotificationRoute(event) : null;
};

/** A desktop deep link (matrix:// / blackout://) opened via the Tauri bridge. */
const routeForDeepLink = (url: string): string | null =>
    resolveNotificationRoute({ type: 'deep_link_opened', source: 'desktop', url });

const ROOM = '!room:bmc';
const THREAD_ROOT = '$root:bmc';

test('notification for a room without thread → routes to the bare room', () => {
    const target = routeForNotification({ room_id: ROOM });
    assert.equal(target, buildCommunitiesPath(null, ROOM));
    assert.ok(!target?.includes('thread='), 'no thread param on a non-threaded tap');
});

test('notification for a room with thread → routes to the room and opens the thread', () => {
    const target = routeForNotification({ room_id: ROOM, thread_root_event_id: THREAD_ROOT });
    assert.ok(target, 'expected a route');
    assert.ok(target!.startsWith(buildCommunitiesPath(null, ROOM)), 'anchored on the room');
    assert.ok(target!.includes(`thread=${encodeURIComponent(THREAD_ROOT)}`), 'opens the thread');
    assert.ok(target!.includes(`event=${encodeURIComponent(THREAD_ROOT)}`), 'jumps to the root');
});

test('notification with no room id → does not navigate', () => {
    assert.equal(routeForNotification(undefined), null);
    assert.equal(routeForNotification({ thread_root_event_id: THREAD_ROOT }), null);
});

test('deep link to a room routes to that room', () => {
    assert.equal(
        routeForDeepLink(`blackout://room/${encodeURIComponent(ROOM)}`),
        buildCommunitiesPath(null, ROOM)
    );
});

test('deep link with no resolvable room → does not navigate', () => {
    assert.equal(routeForDeepLink('blackout://settings'), null);
    assert.equal(routeForDeepLink('https://example.com/room/x'), null);
});
