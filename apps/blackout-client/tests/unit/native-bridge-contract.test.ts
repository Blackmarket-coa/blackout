// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
    dispatchNativeBridgeEvent,
    extractRoomIdFromDeepLinkUrl,
    listenForNativeBridgeEvents,
    type NativeBridgeEvent,
} from '../../src/platform/native-bridge-contract';

describe('canonical native bridge contract (apps/blackout-client)', () => {
    it('resolves room ids from deep-link urls (matrix: + blackout: schemes)', () => {
        expect(extractRoomIdFromDeepLinkUrl('blackout://room/!alpha:blackout.coop')).toBe(
            '!alpha:blackout.coop'
        );
        expect(extractRoomIdFromDeepLinkUrl('matrix://open?room_id=!beta:blackout.coop')).toBe(
            '!beta:blackout.coop'
        );
        expect(extractRoomIdFromDeepLinkUrl('matrix://open?roomId=!gamma:blackout.coop')).toBe(
            '!gamma:blackout.coop'
        );
    });

    it('rejects unsupported protocols and malformed urls', () => {
        expect(extractRoomIdFromDeepLinkUrl('https://example.com/room/123')).toBeNull();
        expect(extractRoomIdFromDeepLinkUrl('http://blackout.coop/room/!x:y')).toBeNull();
        expect(extractRoomIdFromDeepLinkUrl('not-a-url')).toBeNull();
        expect(extractRoomIdFromDeepLinkUrl(undefined)).toBeNull();
        expect(extractRoomIdFromDeepLinkUrl('')).toBeNull();
    });

    it('decodes percent-encoded room ids in the path segment', () => {
        expect(
            extractRoomIdFromDeepLinkUrl('blackout://room/%21alpha%3Ablackout.coop')
        ).toBe('!alpha:blackout.coop');
    });

    it('round-trips events through the global dispatch/listen channel', () => {
        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => {
            seen.push(event);
        });

        dispatchNativeBridgeEvent({
            type: 'deep_link_opened',
            source: 'mobile',
            url: 'blackout://room/!alpha:blackout.coop',
        });

        stop();

        expect(seen).toEqual([
            {
                type: 'deep_link_opened',
                source: 'mobile',
                url: 'blackout://room/!alpha:blackout.coop',
            },
        ]);
    });

    it('routes notification interaction payloads with room ids (parity with blackout-web)', () => {
        const callback = vi.fn<(event: NativeBridgeEvent) => void>();
        const stop = listenForNativeBridgeEvents(callback);

        dispatchNativeBridgeEvent({
            type: 'notification_interacted',
            source: 'mobile',
            roomId: '!incident:blackout.coop',
        });

        stop();

        expect(callback).toHaveBeenCalledWith({
            type: 'notification_interacted',
            source: 'mobile',
            roomId: '!incident:blackout.coop',
        });
    });

    it('emits unread count updates through the shared contract (parity with blackout-web)', () => {
        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => {
            seen.push(event);
        });

        dispatchNativeBridgeEvent({
            type: 'unread_count_changed',
            source: 'desktop',
            unread: 7,
        });

        stop();

        expect(seen).toEqual([
            {
                type: 'unread_count_changed',
                source: 'desktop',
                unread: 7,
            },
        ]);
    });

    it('detaches the listener after stop() so later events are not delivered', () => {
        const callback = vi.fn();
        const stop = listenForNativeBridgeEvents(callback);
        stop();

        dispatchNativeBridgeEvent({
            type: 'resume_sync',
            source: 'desktop',
        });

        expect(callback).not.toHaveBeenCalled();
    });
});
