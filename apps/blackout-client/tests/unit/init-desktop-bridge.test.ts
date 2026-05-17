// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    dispatchNativeBridgeEvent,
} from '../../src/platform/native-bridge-contract';
import { initDesktopBridge } from '../../src/platform/initDesktopBridge';

type DeepLinkHandler = (event: { payload?: unknown }) => void;

const buildTauriMock = () => {
    const listeners = new Map<string, DeepLinkHandler[]>();
    const invoke = vi.fn(async () => undefined);
    const listen = vi.fn(async (eventName: string, handler: DeepLinkHandler) => {
        const list = listeners.get(eventName) ?? [];
        list.push(handler);
        listeners.set(eventName, list);
        return () => {
            listeners.set(
                eventName,
                (listeners.get(eventName) ?? []).filter((h) => h !== handler)
            );
        };
    });
    return {
        listeners,
        invoke,
        bridge: { event: { listen }, core: { invoke } },
    };
};

describe('initDesktopBridge', () => {
    beforeEach(() => {
        delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
    });

    afterEach(() => {
        delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
    });

    it('is a no-op when not running in a Tauri shell', async () => {
        await expect(initDesktopBridge()).resolves.toBeUndefined();
    });

    it('subscribes to deep-link://new-url and dispatches deep_link_opened', async () => {
        const tauri = buildTauriMock();
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = tauri.bridge;

        await initDesktopBridge();

        const seen: string[] = [];
        const handlerStop = ((event: Event) => {
            const detail = (event as CustomEvent<{ type?: string; url?: string }>).detail;
            if (detail?.type === 'deep_link_opened' && typeof detail.url === 'string') {
                seen.push(detail.url);
            }
        }) as EventListener;
        globalThis.addEventListener('blackout:native-event', handlerStop);

        const handlers = tauri.listeners.get('deep-link://new-url') ?? [];
        expect(handlers.length).toBe(1);
        handlers[0]({ payload: ['blackout://room/!a:srv', 'matrix://open?roomId=!b:srv'] });

        expect(seen).toEqual([
            'blackout://room/!a:srv',
            'matrix://open?roomId=!b:srv',
        ]);

        globalThis.removeEventListener('blackout:native-event', handlerStop);
    });

    it('extracts deep-link URLs from single-instance argv tuples', async () => {
        const tauri = buildTauriMock();
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = tauri.bridge;

        await initDesktopBridge();

        const seen: string[] = [];
        const listener = ((event: Event) => {
            const detail = (event as CustomEvent<{ type?: string; url?: string }>).detail;
            if (detail?.type === 'deep_link_opened' && typeof detail.url === 'string') {
                seen.push(detail.url);
            }
        }) as EventListener;
        globalThis.addEventListener('blackout:native-event', listener);

        const handlers = tauri.listeners.get('single-instance') ?? [];
        expect(handlers.length).toBe(1);

        // Rust tuple `(argv, cwd)` serialized form: argv is nested, cwd
        // is a sibling string. Only argv entries with a registered
        // scheme are forwarded.
        handlers[0]({
            payload: [
                ['blackout', 'blackout://room/!a:srv', '--ignored=flag'],
                '/home/user',
            ],
        });

        // Flat-list variant (some single-instance versions emit argv directly).
        handlers[0]({
            payload: ['blackout', 'matrix://open?roomId=!b:srv'],
        });

        // Object-shape variant.
        handlers[0]({
            payload: { argv: ['blackout', 'blackout://room/!c:srv'] },
        });

        expect(seen).toEqual([
            'blackout://room/!a:srv',
            'matrix://open?roomId=!b:srv',
            'blackout://room/!c:srv',
        ]);

        globalThis.removeEventListener('blackout:native-event', listener);
    });

    it('ignores non-deep-link argv from single-instance events', async () => {
        const tauri = buildTauriMock();
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = tauri.bridge;

        await initDesktopBridge();

        const seen: string[] = [];
        const listener = ((event: Event) => {
            const detail = (event as CustomEvent<{ type?: string }>).detail;
            if (detail?.type === 'deep_link_opened') seen.push('deep_link_opened');
        }) as EventListener;
        globalThis.addEventListener('blackout:native-event', listener);

        const handlers = tauri.listeners.get('single-instance') ?? [];
        handlers[0]({
            payload: [['blackout', '--hidden', '/path/to/file'], '/cwd'],
        });

        expect(seen).toEqual([]);
        globalThis.removeEventListener('blackout:native-event', listener);
    });

    it('forwards unread_count_changed events to the Tauri set_unread_count command', async () => {
        const tauri = buildTauriMock();
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = tauri.bridge;

        await initDesktopBridge();

        dispatchNativeBridgeEvent({
            type: 'unread_count_changed',
            source: 'web',
            unread: 12,
        });

        expect(tauri.invoke).toHaveBeenCalledWith('set_unread_count', { unread: 12 });
    });

    it('does not invoke set_unread_count for unrelated bridge events', async () => {
        const tauri = buildTauriMock();
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = tauri.bridge;

        await initDesktopBridge();

        dispatchNativeBridgeEvent({
            type: 'resume_sync',
            source: 'desktop',
        });

        expect(tauri.invoke).not.toHaveBeenCalled();
    });
});
