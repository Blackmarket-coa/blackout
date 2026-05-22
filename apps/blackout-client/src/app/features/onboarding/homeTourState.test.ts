// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => null,
}));

import { HOME_TOUR_STEPS } from './homeTourSteps';
import { __resetHomeTourStateForTests, useHomeTour } from './homeTourState';

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

const renderHook = async <T,>(hook: () => T) => {
    const ref: { current: T | null } = { current: null };
    const Component = () => {
        ref.current = hook();
        return null;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(Component));
        await flush();
    });
    return ref as { current: T };
};

describe('useHomeTour', () => {
    beforeEach(() => {
        window.localStorage.clear();
        __resetHomeTourStateForTests();
    });

    it('starts in the idle state', async () => {
        const result = await renderHook(() => useHomeTour());
        expect(result.current.state.status).toBe('idle');
        expect(result.current.state.stepIndex).toBe(0);
    });

    it('starts the tour and persists running state', async () => {
        const result = await renderHook(() => useHomeTour());
        await act(async () => {
            await result.current.start();
            await flush();
        });
        expect(result.current.state.status).toBe('running');
        expect(result.current.state.stepIndex).toBe(0);
        const raw = window.localStorage.getItem('co.bmc.onboarding.home_tour.local.v1');
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!).status).toBe('running');
    });

    it('advance completes when reaching the last step', async () => {
        const result = await renderHook(() => useHomeTour());
        await act(async () => {
            await result.current.start();
            await flush();
        });
        const total = HOME_TOUR_STEPS.length;
        for (let i = 0; i < total - 1; i++) {
            await act(async () => {
                await result.current.advance(total);
                await flush();
            });
        }
        expect(result.current.state.status).toBe('running');
        await act(async () => {
            await result.current.advance(total);
            await flush();
        });
        expect(result.current.state.status).toBe('completed');
    });

    it('skip transitions to dismissed', async () => {
        const result = await renderHook(() => useHomeTour());
        await act(async () => {
            await result.current.start();
            await result.current.skip();
            await flush();
        });
        expect(result.current.state.status).toBe('dismissed');
    });

    it('uses a separate localStorage key from the wizard progress', async () => {
        const result = await renderHook(() => useHomeTour());
        await act(async () => {
            await result.current.start();
            await flush();
        });
        expect(window.localStorage.getItem('co.bmc.onboarding.progress.local.v3')).toBeNull();
        expect(window.localStorage.getItem('co.bmc.onboarding.home_tour.local.v1')).not.toBeNull();
    });
});
