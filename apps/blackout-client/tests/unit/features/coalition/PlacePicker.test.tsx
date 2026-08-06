// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CoalitionPlace } from '@blackout/core';
import { PlacePicker } from '../../../../src/app/features/coalition/map/PlacePicker';

const granted = { value: true };
const requestEnable = vi.fn();

vi.mock('../../../../src/app/features/location/locationConsent', () => ({
    useLocationConsentFlow: () => ({
        granted: granted.value,
        disclosureOpen: false,
        requestEnable,
        confirmEnable: vi.fn(),
        cancelEnable: vi.fn(),
        grant: vi.fn(),
        revoke: vi.fn(),
    }),
    coarsenCoordinate: (value: number) => Math.round(value * 100) / 100,
}));

vi.mock('../../../../src/app/features/location/LocationConsentDialog', () => ({
    LocationConsentDialog: () => null,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

/** Renders a controlled picker and exposes the value it last reported. */
const render = (initial: CoalitionPlace | null = null) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const state: { place: CoalitionPlace | null } = { place: initial };

    const Harness = () => {
        const [place, setPlace] = React.useState<CoalitionPlace | null>(initial);
        state.place = place;
        return <PlacePicker value={place} onChange={setPlace} testId="p" />;
    };

    act(() => {
        root.render(<Harness />);
    });
    mountedRoots.push(root);
    return { container, state };
};

const click = async (container: HTMLElement, testId: string) => {
    await act(async () => {
        (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
    });
};

const setNativeValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(
        new Event(el instanceof HTMLSelectElement ? 'change' : 'input', {
            bubbles: true,
        })
    );
};

beforeEach(() => {
    granted.value = true;
    requestEnable.mockClear();
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('PlacePicker — a pin, an area, or nowhere', () => {
    /**
     * "Nowhere" is a real answer. A need for a developer has no location, and a
     * picker that forces one would scatter fictional pins across the map.
     */
    it('starts with no location and offers no coordinate fields', () => {
        const { container, state } = render();
        expect(state.place).toBeNull();
        expect(container.querySelector('[data-testid="p-latitude"]')).toBeNull();
        expect(
            container.querySelector('[data-testid="p-mode-none"]')?.getAttribute('aria-pressed')
        ).toBe('true');
    });

    it('creates a pin with no radius', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-pin');
        expect(state.place).toEqual({
            kind: 'pin',
            latitude: 0,
            longitude: 0,
            label: undefined,
        });
        // A pin is an address; there is no radius control to get wrong.
        expect(container.querySelector('[data-testid="p-radius"]')).toBeNull();
    });

    it('creates an area with a default radius and a radius control', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-area');
        expect(state.place?.kind).toBe('area');
        expect(container.querySelector('[data-testid="p-radius"]')).toBeTruthy();

        const radius = container.querySelector('[data-testid="p-radius"]') as HTMLSelectElement;
        await act(async () => setNativeValue(radius, '25000'));
        expect(state.place).toMatchObject({ kind: 'area', radiusMeters: 25000 });
    });

    it('carries coordinates across a mode switch', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-pin');

        const lat = container.querySelector('[data-testid="p-latitude"]') as HTMLInputElement;
        const lng = container.querySelector('[data-testid="p-longitude"]') as HTMLInputElement;
        await act(async () => setNativeValue(lat, '47.6062'));
        await act(async () => setNativeValue(lng, '-122.3321'));

        // Someone who typed a location then decided it was an area shouldn't
        // have to retype it.
        await click(container, 'p-mode-area');
        expect(state.place).toMatchObject({
            kind: 'area',
            latitude: 47.6062,
            longitude: -122.3321,
        });
    });

    it('clears the place when returning to "No location"', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-area');
        await click(container, 'p-mode-none');
        expect(state.place).toBeNull();
    });

    it('keeps the chosen radius when toggling back to area', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-area');
        const radius = container.querySelector('[data-testid="p-radius"]') as HTMLSelectElement;
        await act(async () => setNativeValue(radius, '50000'));

        await click(container, 'p-mode-pin');
        await click(container, 'p-mode-area');
        expect(state.place).toMatchObject({ radiusMeters: 50000 });
    });
});

describe('PlacePicker — typing a coordinate', () => {
    const typeInto = async (container: HTMLElement, testId: string, text: string) => {
        const field = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
        await act(async () => setNativeValue(field, text));
        return field;
    };

    /**
     * Most of the Americas has a negative longitude. A field that cannot hold
     * the "-" while you type the rest of the number cannot express Seattle.
     */
    it('accepts a negative longitude typed a character at a time', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-pin');

        // A number input reports partial input like "-" as an empty string, so
        // this is the sequence the component actually sees.
        await typeInto(container, 'p-longitude', '');
        await typeInto(container, 'p-longitude', '-122');
        await typeInto(container, 'p-longitude', '-122.3321');

        expect(state.place).toMatchObject({ longitude: -122.3321 });
    });

    it('lets a field be cleared without snapping the pin to the equator', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-pin');
        await typeInto(container, 'p-latitude', '47.6062');
        expect(state.place).toMatchObject({ latitude: 47.6062 });

        const field = await typeInto(container, 'p-latitude', '');
        // The field empties so the next digits can be typed, and the pin holds
        // its last real position rather than jumping to 0,0.
        expect(field.value).toBe('');
        expect(state.place).toMatchObject({ latitude: 47.6062 });
    });

    it('keeps what was typed on screen rather than overwriting it mid-edit', async () => {
        const { container } = render();
        await click(container, 'p-mode-pin');
        const field = await typeInto(container, 'p-latitude', '47.');
        expect(field.value).toBe('47.');
    });

    it('refuses a coordinate outside the world, and says so', async () => {
        const { container, state } = render();
        await click(container, 'p-mode-pin');
        await typeInto(container, 'p-latitude', '47.6062');
        await typeInto(container, 'p-latitude', '999');

        // Not committed — a latitude of 999 is nowhere a map can draw.
        expect(state.place).toMatchObject({ latitude: 47.6062 });
        // And the mismatch between field and pin has to be visible, or the user
        // saves a position they cannot see.
        expect(container.querySelector('[data-testid="p-latitude-error"]')).toBeTruthy();
    });

    it('clears the warning once the value is back in range', async () => {
        const { container } = render();
        await click(container, 'p-mode-pin');
        await typeInto(container, 'p-longitude', '999');
        expect(container.querySelector('[data-testid="p-longitude-error"]')).toBeTruthy();

        await typeInto(container, 'p-longitude', '-122.3321');
        expect(container.querySelector('[data-testid="p-longitude-error"]')).toBeNull();
    });

    it('shows a coordinate that arrived from outside the field', async () => {
        const { container } = render();
        await click(container, 'p-mode-pin');
        await typeInto(container, 'p-latitude', '10');

        // Switching to area rebuilds the value; the field must follow it.
        await click(container, 'p-mode-area');
        const field = container.querySelector('[data-testid="p-latitude"]') as HTMLInputElement;
        expect(field.value).toBe('10');
    });
});

describe('PlacePicker — using the device location', () => {
    const withGeolocation = (coords: { latitude: number; longitude: number }) => {
        const getCurrentPosition = vi.fn(
            (onSuccess: (position: { coords: typeof coords }) => void) => onSuccess({ coords })
        );
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition },
        });
        return getCurrentPosition;
    };

    /**
     * The device's precise position is never auto-published. Someone who wants
     * an exact address types it; tapping a button snaps to the same ~1.1km grid
     * the near-me filter uses.
     */
    it('coarsens the device position instead of publishing it exactly', async () => {
        withGeolocation({ latitude: 47.60621234, longitude: -122.33219876 });
        const { container, state } = render();
        await click(container, 'p-mode-pin');
        await click(container, 'p-locate');

        expect(state.place).toMatchObject({ latitude: 47.61, longitude: -122.33 });
    });

    it('asks for consent before reading a location, and reads nothing until granted', async () => {
        granted.value = false;
        const getCurrentPosition = withGeolocation({ latitude: 1, longitude: 2 });
        const { container } = render();
        await click(container, 'p-mode-pin');
        await click(container, 'p-locate');

        expect(requestEnable).toHaveBeenCalled();
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });
});
