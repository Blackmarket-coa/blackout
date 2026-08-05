// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

/**
 * A toggle that still pays for the thing it hides is a filter, not a toggle.
 *
 * Every map source except the spatial feed used to load whether or not its
 * legend layer was showing, so hiding a layer stopped it being drawn but not
 * fetched. These pin the gate at the hook level, where it belongs.
 */

const fetchCoalitionNeeds = vi.fn(async () => ({ needs: [] }));
const fetchMutualAid = vi.fn(async () => ({ posts: [] }));
const fetchSellerLocations = vi.fn(async () => ({ locations: [] }));
const fetchSpatialFeed = vi.fn(async () => ({ items: [] }));

vi.mock('../../../../src/app/features/coalition/coalitionClient', () => ({
    fetchCoalitionNeeds: (...a: unknown[]) => fetchCoalitionNeeds(...(a as [])),
    fetchMutualAid: (...a: unknown[]) => fetchMutualAid(...(a as [])),
    fetchSellerLocations: (...a: unknown[]) => fetchSellerLocations(...(a as [])),
    fetchSpatialFeed: (...a: unknown[]) => fetchSpatialFeed(...(a as [])),
    // The module exports far more than this file exercises; the rest only has
    // to exist so the import resolves.
    fetchCoalitionEvents: vi.fn(),
    fetchCoalitionFeed: vi.fn(),
    fetchCoalitionProject: vi.fn(),
    fetchCoalitionProjects: vi.fn(),
    fetchCoalitionResources: vi.fn(),
    fetchCoalitionTasks: vi.fn(),
    fetchFeedComments: vi.fn(),
    fetchFeedLikes: vi.fn(),
    fetchKits: vi.fn(),
    fetchCoalitionNotifications: vi.fn(),
    fetchMyRingInvites: vi.fn(),
    fetchProjectSupporters: vi.fn(),
    fetchRings: vi.fn(),
    markCoalitionNotificationRead: vi.fn(),
    postFeedComment: vi.fn(),
    setFeedLike: vi.fn(),
    supportCoalitionProject: vi.fn(),
}));

const { useCoalitionNeeds, useMutualAid, useSellerLocations, useSpatialFeed } = await import(
    '../../../../src/app/features/coalition/hooks/useCoalitionFeed'
);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];
const SCOPE = { canopyId: '!c:server' };

type Probed = { loading: boolean; data: unknown };

/**
 * Mounts a hook and returns both what it reported and a `rerender` that keeps
 * the *same* component instance — switching a layer off has to be tested as a
 * prop change, not as a fresh mount.
 */
const renderHook = async <A,>(useIt: (arg: A) => Probed, initial: A) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const seen: Probed = { loading: false, data: null };

    const Probe = ({ arg }: { arg: A }) => {
        const state = useIt(arg);
        seen.loading = state.loading;
        seen.data = state.data;
        return null;
    };

    const rerender = async (arg: A) => {
        await act(async () => {
            root.render(<Probe arg={arg} />);
        });
    };

    await rerender(initial);
    mountedRoots.push(root);
    return { seen, rerender };
};

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('a disabled hook issues no request', () => {
    it('skips the needs fetch when the layer is hidden', async () => {
        await renderHook((on: boolean) => useCoalitionNeeds(SCOPE, on), false);
        expect(fetchCoalitionNeeds).not.toHaveBeenCalled();
    });

    it('fetches once the layer is shown', async () => {
        await renderHook((on: boolean) => useCoalitionNeeds(SCOPE, on), true);
        expect(fetchCoalitionNeeds).toHaveBeenCalledTimes(1);
    });

    it('skips mutual aid and seller locations when their layers are hidden', async () => {
        await renderHook((on: boolean) => useMutualAid(SCOPE, undefined, on), false);
        await renderHook((on: boolean) => useSellerLocations(undefined, on), false);
        expect(fetchMutualAid).not.toHaveBeenCalled();
        expect(fetchSellerLocations).not.toHaveBeenCalled();
    });

    /**
     * Reporting `loading` for a hidden layer would leave a spinner up forever —
     * nothing is ever going to resolve it.
     */
    it('is not pending while disabled', async () => {
        const { seen } = await renderHook((on: boolean) => useCoalitionNeeds(SCOPE, on), false);
        expect(seen.loading).toBe(false);
        expect(seen.data).toBeNull();
    });

    it('drops held data when the layer is switched off, and refetches when it returns', async () => {
        const { seen, rerender } = await renderHook(
            (on: boolean) => useCoalitionNeeds(SCOPE, on),
            true
        );
        expect(fetchCoalitionNeeds).toHaveBeenCalledTimes(1);
        expect(seen.data).not.toBeNull();

        // Keeping the old payload would let a re-enabled layer flash the
        // previous canopy's pins before its own arrive.
        await rerender(false);
        expect(seen.data).toBeNull();
        expect(seen.loading).toBe(false);
        expect(fetchCoalitionNeeds).toHaveBeenCalledTimes(1);

        await rerender(true);
        expect(fetchCoalitionNeeds).toHaveBeenCalledTimes(2);
        expect(seen.data).not.toBeNull();
    });
});

describe('the spatial feed treats "no layers" as no request', () => {
    /**
     * The endpoint reads an absent layer filter as "all layers", so asking for
     * an empty list would return everything — the exact opposite of hiding it.
     */
    it('skips the request when every layer is hidden', async () => {
        await renderHook((layers: string[]) => useSpatialFeed(SCOPE, layers), []);
        expect(fetchSpatialFeed).not.toHaveBeenCalled();
    });

    it('requests the layers that are showing', async () => {
        await renderHook((layers: string[]) => useSpatialFeed(SCOPE, layers), ['aid']);
        expect(fetchSpatialFeed).toHaveBeenCalledWith(SCOPE, ['aid']);
    });
});
