import test from 'node:test';
import assert from 'node:assert/strict';

// Harness: proves a Capacitor push-notification tap routes to the correct
// in-app location, without a device or the native runtime in the loop. It
// exercises the SAME payload → bridge-event mapping the mobile shell uses
// (`notificationDataToInteractedEvent`, consumed by mobile-bootstrap.ts) and
// the SAME routing the app applies on tap (`resolveNotificationRoute`, consumed
// by NativeBridgeListener). Covers: room without thread, room with thread, and
// an invalid/absent room id.
import {
    notificationDataToInteractedEvent,
    resolveNotificationRoute,
    type RawNotificationData,
} from '../../apps/blackout-client/src/platform/notification-routing';
import { buildCommunitiesPath } from '../../apps/blackout-client/src/app/pages/paths';

/** Shape Capacitor's `pushNotificationActionPerformed` delivers on tap. */
interface CapacitorActionPerformed {
    actionId: string;
    notification: { data?: RawNotificationData };
}

/** The mobile shell's tap handler, reduced to its routable decision. */
const routeForAction = (action: CapacitorActionPerformed): string | null => {
    const event = notificationDataToInteractedEvent(action.notification?.data, 'mobile');
    return event ? resolveNotificationRoute(event) : null;
};

const ROOM = '!room:bmc';
const THREAD_ROOT = '$root:bmc';

test('room without thread → routes to the bare room', () => {
    const target = routeForAction({
        actionId: 'tap',
        notification: { data: { room_id: ROOM } },
    });
    assert.equal(target, buildCommunitiesPath(null, ROOM));
    assert.ok(!target?.includes('thread='), 'no thread param on a non-threaded tap');
});

test('room with thread → routes to the room and opens the thread', () => {
    const target = routeForAction({
        actionId: 'tap',
        notification: { data: { room_id: ROOM, thread_root_event_id: THREAD_ROOT } },
    });
    assert.ok(target, 'expected a route');
    assert.ok(
        target!.startsWith(buildCommunitiesPath(null, ROOM)),
        'route is anchored on the room'
    );
    assert.ok(target!.includes(`thread=${encodeURIComponent(THREAD_ROOT)}`), 'opens the thread');
    assert.ok(target!.includes(`event=${encodeURIComponent(THREAD_ROOT)}`), 'jumps to the root');
});

test('missing room id → does not navigate', () => {
    assert.equal(routeForAction({ actionId: 'tap', notification: {} }), null);
    assert.equal(
        routeForAction({
            actionId: 'tap',
            notification: { data: { thread_root_event_id: THREAD_ROOT } },
        }),
        null
    );
});

test('deep-link tap (matrix:// scheme) routes to the linked room', () => {
    const target = resolveNotificationRoute({
        type: 'deep_link_opened',
        source: 'mobile',
        url: `matrix://room/${encodeURIComponent(ROOM)}`,
    });
    assert.equal(target, buildCommunitiesPath(null, ROOM));
});

test('unresolvable deep link → does not navigate', () => {
    assert.equal(
        resolveNotificationRoute({
            type: 'deep_link_opened',
            source: 'mobile',
            url: 'blackout://settings',
        }),
        null
    );
});
