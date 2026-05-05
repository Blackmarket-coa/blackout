// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, createStore } from 'jotai';

import { matrixClientAtom } from '../../src/app/state/auth';
import {
    dispatchNativeBridgeEvent,
    listenForNativeBridgeEvents,
    type NativeBridgeEvent,
} from '../../src/platform/native-bridge-contract';
import { LifecycleSyncBroker } from '../../src/platform/LifecycleSyncBroker';

const mountBroker = (store: ReturnType<typeof createStore>) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    return { container, root };
};

describe('LifecycleSyncBroker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
    });

    afterEach(() => {
        // jsdom resets between tests
    });

    it('calls retryImmediately on the matrix client when resume_sync arrives', async () => {
        const retryImmediately = vi.fn();
        const store = createStore();
        store.set(matrixClientAtom, { retryImmediately } as unknown as Parameters<typeof store.set>[1]);

        const { root } = mountBroker(store);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <LifecycleSyncBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'resume_sync',
                source: 'mobile',
            });
            await Promise.resolve();
        });

        expect(retryImmediately).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no matrix client is bound', async () => {
        const store = createStore();
        const { root } = mountBroker(store);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <LifecycleSyncBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        expect(() => {
            dispatchNativeBridgeEvent({
                type: 'resume_sync',
                source: 'desktop',
            });
        }).not.toThrow();
    });

    it('re-emits resume_sync when document becomes visible (Page Visibility fallback)', async () => {
        const retryImmediately = vi.fn();
        const store = createStore();
        store.set(matrixClientAtom, { retryImmediately } as unknown as Parameters<typeof store.set>[1]);

        // Start in the hidden state so the visibilitychange transition is observable.
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });

        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => seen.push(event));

        const { root } = mountBroker(store);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <LifecycleSyncBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        // Now flip to visible and fire the event.
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            await Promise.resolve();
        });

        stop();

        const resumeEvents = seen.filter((e) => e.type === 'resume_sync');
        expect(resumeEvents.length).toBeGreaterThanOrEqual(1);
        expect(resumeEvents[0]).toEqual({ type: 'resume_sync', source: 'web' });
        expect(retryImmediately).toHaveBeenCalled();
    });

    it('does not emit resume_sync when document becomes hidden', async () => {
        const store = createStore();
        store.set(
            matrixClientAtom,
            { retryImmediately: vi.fn() } as unknown as Parameters<typeof store.set>[1]
        );

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });

        const { root } = mountBroker(store);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <LifecycleSyncBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => seen.push(event));

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            await Promise.resolve();
        });

        stop();

        const resumeEvents = seen.filter((e) => e.type === 'resume_sync');
        expect(resumeEvents).toHaveLength(0);
    });
});
