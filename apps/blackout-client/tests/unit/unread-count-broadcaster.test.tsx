// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { atom, Provider as JotaiProvider, createStore, type PrimitiveAtom } from 'jotai';

vi.mock('../../src/app/state/bmc-unreads', () => {
    const sourceAtom = atom(0);
    return {
        totalUnreadAtom: sourceAtom,
        __sourceAtom: sourceAtom,
    };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSourceAtom = async (): Promise<PrimitiveAtom<number>> => {
    const mod = (await import('../../src/app/state/bmc-unreads')) as unknown as {
        __sourceAtom: PrimitiveAtom<number>;
    };
    return mod.__sourceAtom;
};

import {
    listenForNativeBridgeEvents,
    type NativeBridgeEvent,
} from '../../src/platform/native-bridge-contract';
import { UnreadCountBroadcaster } from '../../src/platform/UnreadCountBroadcaster';

describe('UnreadCountBroadcaster', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        // reset the underlying source atom between cases
    });

    it('dispatches the aggregate unread total over the native bridge on mount', async () => {
        const store = createStore();
        store.set(await getSourceAtom(), 10);

        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => seen.push(event));

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <UnreadCountBroadcaster />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        stop();

        const unreadEvents = seen.filter((e) => e.type === 'unread_count_changed');
        expect(unreadEvents).toHaveLength(1);
        expect(unreadEvents[0]).toEqual({
            type: 'unread_count_changed',
            source: 'web',
            unread: 10,
        });
    });

    it('floors negative or fractional counts to a non-negative integer', async () => {
        const store = createStore();
        store.set(await getSourceAtom(), -2.7);

        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => seen.push(event));

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <UnreadCountBroadcaster />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        stop();

        const unreadEvents = seen.filter((e) => e.type === 'unread_count_changed');
        expect(unreadEvents).toHaveLength(1);
        expect(unreadEvents[0]).toEqual({
            type: 'unread_count_changed',
            source: 'web',
            unread: 0,
        });
    });

    it('re-broadcasts when the unread total changes', async () => {
        const store = createStore();
        store.set(await getSourceAtom(), 1);

        const seen: NativeBridgeEvent[] = [];
        const stop = listenForNativeBridgeEvents((event) => seen.push(event));

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <UnreadCountBroadcaster />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            store.set(await getSourceAtom(), 4);
            await Promise.resolve();
        });

        stop();

        const counts = seen
            .filter((e) => e.type === 'unread_count_changed')
            .map((e) => (e as { unread: number }).unread);
        expect(counts).toEqual([1, 4]);
    });
});
