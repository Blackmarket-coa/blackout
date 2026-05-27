// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider, createStore } from 'jotai';
import CommunitiesRoute from '../../../../src/app/features/communities/CommunitiesRoute';
import {
    roomJumpTargetEventIdAtom,
    selectedRoomIdAtom,
    selectedSpaceIdAtom,
} from '../../../../src/app/state/navigation';

// ClientLayout is a heavy module; CommunitiesRoute only needs to mount it.
// Stub it so this test isolates the URL -> selection-atom mapping.
vi.mock('../../../../src/app/pages/client/ClientLayout', () => ({
    default: () => <div data-testid="client-layout" />,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const renderAt = (path: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    // Seed a stale den to prove the canopy-only route clears it.
    store.set(selectedRoomIdAtom, '!stale-den:server');
    store.set(selectedSpaceIdAtom, '!stale-canopy:server');

    act(() => {
        root.render(
            <Provider store={store}>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route
                            path="/communities/:canopyId/dens/:denId"
                            element={<CommunitiesRoute />}
                        />
                        <Route path="/communities/:canopyId" element={<CommunitiesRoute />} />
                    </Routes>
                </MemoryRouter>
            </Provider>
        );
    });
    mountedRoots.push(root);
    return store;
};

describe('CommunitiesRoute URL -> atom mapping', () => {
    afterEach(() => {
        act(() => {
            mountedRoots.splice(0).forEach((root) => root.unmount());
        });
        document.body.innerHTML = '';
    });

    it('maps canopy + den path segments into the selection atoms', () => {
        const canopy = '!canopy:server';
        const den = '!den:server';
        const store = renderAt(
            `/communities/${encodeURIComponent(canopy)}/dens/${encodeURIComponent(den)}`
        );

        expect(store.get(selectedSpaceIdAtom)).toBe(canopy);
        expect(store.get(selectedRoomIdAtom)).toBe(den);
    });

    it('clears the selected den on a canopy-only route (no stale den carried forward)', () => {
        const canopy = '!canopy:server';
        const store = renderAt(`/communities/${encodeURIComponent(canopy)}`);

        expect(store.get(selectedSpaceIdAtom)).toBe(canopy);
        expect(store.get(selectedRoomIdAtom)).toBeNull();
    });

    it('treats the "-" canopy sentinel as no parent canopy', () => {
        const den = '!orphan:server';
        const store = renderAt(`/communities/-/dens/${encodeURIComponent(den)}`);

        expect(store.get(selectedSpaceIdAtom)).toBeNull();
        expect(store.get(selectedRoomIdAtom)).toBe(den);
    });

    it('hydrates the jump-target event from ?event=', () => {
        const den = '!den:server';
        const store = renderAt(
            `/communities/-/dens/${encodeURIComponent(den)}?event=${encodeURIComponent(
                '$evt:server'
            )}`
        );

        expect(store.get(roomJumpTargetEventIdAtom)).toBe('$evt:server');
    });
});
