// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchNearbySignalsMock = vi.fn();

vi.mock('../coalition/coalitionClient', () => ({
    fetchNearbySignals: (...args: unknown[]) => fetchNearbySignalsMock(...args),
}));

import { coarsen, useNearbySignals, type NearbySignalsState } from './useNearbySignals';

const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
};

const renderHook = async () => {
    const ref: { current: NearbySignalsState | null } = { current: null };
    const Probe = () => {
        ref.current = useNearbySignals();
        return null;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(Probe));
        await flush();
    });
    return ref as { current: NearbySignalsState };
};

const geolocationMock = {
    getCurrentPosition: vi.fn(),
};

describe('useNearbySignals', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        fetchNearbySignalsMock.mockReset();
        geolocationMock.getCurrentPosition.mockReset();
        vi.stubGlobal('navigator', { geolocation: geolocationMock });
    });

    it('coarsens coordinates to a ~1km grid', () => {
        expect(coarsen(48.858844)).toBe(48.86);
        expect(coarsen(-140.5049)).toBe(-140.5);
    });

    it('starts disabled and never touches geolocation', async () => {
        const hook = await renderHook();
        expect(hook.current.enabled).toBe(false);
        expect(geolocationMock.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('enable() sends only coarse coordinates and keeps the count', async () => {
        geolocationMock.getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
            onSuccess({
                coords: { latitude: 48.858844, longitude: 2.294351 },
            } as GeolocationPosition);
        });
        fetchNearbySignalsMock.mockResolvedValue({ count: 12, signals: [], generatedAt: '' });

        const hook = await renderHook();
        await act(async () => {
            hook.current.enable();
            await flush();
        });

        expect(fetchNearbySignalsMock).toHaveBeenCalledWith({
            lat: 48.86,
            lng: 2.29,
            radiusKm: 10,
        });
        expect(hook.current.count).toBe(12);
        expect(hook.current.enabled).toBe(true);
        expect(localStorage.getItem('co.bmc.home.nearbySignals.v1')).toBe('on');
    });

    it('disable() clears state and persists the opt-out', async () => {
        localStorage.setItem('co.bmc.home.nearbySignals.v1', 'on');
        geolocationMock.getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
            onSuccess({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
        });
        fetchNearbySignalsMock.mockResolvedValue({ count: 3, signals: [], generatedAt: '' });

        const hook = await renderHook();
        expect(hook.current.enabled).toBe(true);
        await act(async () => {
            hook.current.disable();
            await flush();
        });
        expect(hook.current.enabled).toBe(false);
        expect(hook.current.count).toBe(null);
        expect(localStorage.getItem('co.bmc.home.nearbySignals.v1')).toBe('off');
    });

    it('surfaces a denied geolocation prompt as an error', async () => {
        geolocationMock.getCurrentPosition.mockImplementation(
            (_onSuccess: PositionCallback, onError: PositionErrorCallback) => {
                onError({} as GeolocationPositionError);
            }
        );
        const hook = await renderHook();
        await act(async () => {
            hook.current.enable();
            await flush();
        });
        expect(hook.current.error).toBe('Could not get your location.');
        expect(fetchNearbySignalsMock).not.toHaveBeenCalled();
    });
});
