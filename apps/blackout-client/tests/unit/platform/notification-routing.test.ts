import { describe, expect, it } from 'vitest';
import {
    buildRoomTarget,
    notificationDataToInteractedEvent,
    resolveNotificationRoute,
} from '../../../src/platform/notification-routing';
import { buildCommunitiesPath } from '../../../src/app/pages/paths';

const ROOM = '!room:bmc';
const THREAD_ROOT = '$root:bmc';

describe('buildRoomTarget', () => {
    it('returns the bare room path when no thread root is given', () => {
        expect(buildRoomTarget(ROOM)).toBe(buildCommunitiesPath(null, ROOM));
    });

    it('appends thread + event params for a threaded target', () => {
        const target = buildRoomTarget(ROOM, THREAD_ROOT);
        const id = encodeURIComponent(THREAD_ROOT);
        expect(target).toBe(`${buildCommunitiesPath(null, ROOM)}?thread=${id}&event=${id}`);
    });
});

describe('notificationDataToInteractedEvent', () => {
    it('maps a room-only payload to a room-level interacted event', () => {
        expect(notificationDataToInteractedEvent({ room_id: ROOM }, 'mobile')).toEqual({
            type: 'notification_interacted',
            source: 'mobile',
            roomId: ROOM,
            threadRootEventId: undefined,
        });
    });

    it('carries the thread root when present, tagged with the source', () => {
        expect(
            notificationDataToInteractedEvent(
                { room_id: ROOM, thread_root_event_id: THREAD_ROOT },
                'desktop'
            )
        ).toEqual({
            type: 'notification_interacted',
            source: 'desktop',
            roomId: ROOM,
            threadRootEventId: THREAD_ROOT,
        });
    });

    it('returns null when there is no room to route to', () => {
        expect(notificationDataToInteractedEvent(undefined, 'mobile')).toBeNull();
        expect(notificationDataToInteractedEvent({}, 'mobile')).toBeNull();
        expect(
            notificationDataToInteractedEvent({ thread_root_event_id: THREAD_ROOT }, 'mobile')
        ).toBeNull();
    });
});

describe('resolveNotificationRoute', () => {
    it('routes a notification_interacted event to the room', () => {
        expect(
            resolveNotificationRoute({
                type: 'notification_interacted',
                source: 'mobile',
                roomId: ROOM,
            })
        ).toBe(buildCommunitiesPath(null, ROOM));
    });

    it('routes a threaded notification into the thread', () => {
        const target = resolveNotificationRoute({
            type: 'notification_interacted',
            source: 'desktop',
            roomId: ROOM,
            threadRootEventId: THREAD_ROOT,
        });
        expect(target).toContain(`thread=${encodeURIComponent(THREAD_ROOT)}`);
    });

    it('resolves a deep link to its room', () => {
        expect(
            resolveNotificationRoute({
                type: 'deep_link_opened',
                source: 'desktop',
                url: `matrix://room/${encodeURIComponent(ROOM)}`,
            })
        ).toBe(buildCommunitiesPath(null, ROOM));
    });

    it('returns null for a notification with no room and an unresolvable deep link', () => {
        expect(
            resolveNotificationRoute({
                type: 'notification_interacted',
                source: 'mobile',
                roomId: '',
            })
        ).toBeNull();
        expect(
            resolveNotificationRoute({
                type: 'deep_link_opened',
                source: 'mobile',
                url: 'blackout://settings',
            })
        ).toBeNull();
    });

    it('ignores non-routing bridge events', () => {
        expect(resolveNotificationRoute({ type: 'resume_sync', source: 'mobile' })).toBeNull();
    });
});
