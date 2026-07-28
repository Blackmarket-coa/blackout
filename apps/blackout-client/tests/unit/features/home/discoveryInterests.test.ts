// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const clientRef: { current: FakeClient | null } = { current: null };
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => clientRef.current,
}));

import {
    DISCOVERY_INTERESTS_KEY,
    useDiscoveryInterestTags,
    useTopicFollows,
} from '../../../../src/app/features/home/discoveryInterests';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type AccountDataListener = (event: { getType: () => string }) => void;

/**
 * Minimal MatrixClient stand-in: an account-data store plus the event surface
 * the hooks subscribe to. `echoWrites` controls whether setAccountData applies
 * to the store and emits (a synced server echo) or stays pending (in flight).
 */
class FakeClient {
    tags: string[] = [];

    echoWrites = true;

    setAccountData = vi.fn(async (type: string, content: { tags?: unknown }) => {
        if (!this.echoWrites) return;
        this.tags = Array.isArray(content.tags) ? (content.tags as string[]) : [];
        this.emitAccountData();
    });

    private listeners = new Set<AccountDataListener>();

    getAccountData(type: string): { getContent: () => unknown } | undefined {
        if (type !== DISCOVERY_INTERESTS_KEY) return undefined;
        const tags = [...this.tags];
        return { getContent: () => ({ tags }) };
    }

    on(_event: unknown, listener: AccountDataListener): this {
        this.listeners.add(listener);
        return this;
    }

    removeListener(_event: unknown, listener: AccountDataListener): this {
        this.listeners.delete(listener);
        return this;
    }

    emitAccountData(): void {
        for (const listener of [...this.listeners]) {
            listener({ getType: () => DISCOVERY_INTERESTS_KEY });
        }
    }
}

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

const mountedRoots: ReactDOM.Root[] = [];

const renderHook = async <T>(hook: () => T) => {
    const ref: { current: T | null } = { current: null };
    const Component = () => {
        ref.current = hook();
        return null;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
        root.render(React.createElement(Component));
        await flush();
    });
    return ref as { current: T };
};

beforeEach(() => {
    clientRef.current = new FakeClient();
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    clientRef.current = null;
    vi.clearAllMocks();
});

describe('useDiscoveryInterestTags', () => {
    it('reads stored tags and reacts to account-data pushes', async () => {
        clientRef.current!.tags = ['solarpunk'];
        const result = await renderHook(() => useDiscoveryInterestTags());
        expect([...result.current]).toEqual(['solarpunk']);

        await act(async () => {
            clientRef.current!.tags = ['solarpunk', 'gardens'];
            clientRef.current!.emitAccountData();
            await flush();
        });
        expect(result.current.has('gardens')).toBe(true);
    });
});

describe('useTopicFollows', () => {
    it('follows a topic optimistically and persists the merged tag list', async () => {
        clientRef.current!.echoWrites = false; // write stays in flight
        const result = await renderHook(() => useTopicFollows());
        expect(result.current.canFollow).toBe(true);
        expect(result.current.isFollowing('gardens')).toBe(false);

        await act(async () => {
            await result.current.follow(' gardens ');
            await flush();
        });
        // Optimistic: followed before any server echo arrives.
        expect(result.current.isFollowing('gardens')).toBe(true);
        expect(clientRef.current!.setAccountData).toHaveBeenCalledWith(
            DISCOVERY_INTERESTS_KEY,
            expect.objectContaining({ tags: ['gardens'] })
        );
    });

    it('unfollows a topic, preserving the other stored interests', async () => {
        clientRef.current!.tags = ['gardens', 'tools'];
        const result = await renderHook(() => useTopicFollows());
        expect(result.current.isFollowing('gardens')).toBe(true);

        await act(async () => {
            await result.current.unfollow('gardens');
            await flush();
        });
        expect(result.current.isFollowing('gardens')).toBe(false);
        expect(result.current.isFollowing('tools')).toBe(true);
        expect(clientRef.current!.setAccountData).toHaveBeenCalledWith(
            DISCOVERY_INTERESTS_KEY,
            expect.objectContaining({ tags: ['tools'] })
        );
    });

    it('reverts the optimistic follow when the write fails', async () => {
        clientRef.current!.setAccountData.mockRejectedValueOnce(new Error('offline'));
        const result = await renderHook(() => useTopicFollows());

        let rejected = false;
        await act(async () => {
            await result.current.follow('gardens').catch(() => {
                rejected = true;
            });
            await flush();
        });
        expect(rejected).toBe(true);
        expect(result.current.isFollowing('gardens')).toBe(false);
    });

    it('cannot follow without a signed-in client', async () => {
        clientRef.current = null;
        const result = await renderHook(() => useTopicFollows());
        expect(result.current.canFollow).toBe(false);
        await act(async () => {
            await result.current.follow('gardens');
        });
        expect(result.current.isFollowing('gardens')).toBe(false);
    });
});
