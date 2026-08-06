// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CoalitionPlace } from '@blackout/core';
import { PlaceEditor } from '../../../../src/app/features/coalition/map/PlaceEditor';

/**
 * A place could only be set at creation. Everything behind that — the API
 * patch, the client call — already existed and was tested; only the affordance
 * was missing, so a resource that moved was stuck where it was first put.
 */

vi.mock('../../../../src/app/features/location/locationConsent', () => ({
    useLocationConsentFlow: () => ({
        granted: true,
        disclosureOpen: false,
        requestEnable: vi.fn(),
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
const SEATTLE = { latitude: 47.6062, longitude: -122.3321 };
const PIN: CoalitionPlace = { kind: 'pin', ...SEATTLE };

const render = (
    place: CoalitionPlace | undefined,
    onSave: (p: CoalitionPlace | null) => Promise<void>
) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<PlaceEditor place={place} onSave={onSave} testId="pe" />);
    });
    mountedRoots.push(root);
    return container;
};

const click = async (container: HTMLElement, testId: string) => {
    await act(async () => {
        (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('PlaceEditor', () => {
    it('shows the current place and stays collapsed until asked', () => {
        const container = render(PIN, vi.fn());
        expect(container.querySelector('[data-testid="pe-summary"]')?.textContent).toContain(
            '47.6062'
        );
        // A picker on every card would bury the list it belongs to.
        expect(container.querySelector('[data-testid="pe-form"]')).toBeNull();
    });

    it('offers to place something that is not on the map yet', () => {
        const container = render(undefined, vi.fn());
        const summary = container.querySelector('[data-testid="pe-summary"]');
        expect(summary?.textContent).toContain('Not on the map');
        expect(container.querySelector('[data-testid="pe-edit"]')?.textContent).toBe(
            'Put it on the map'
        );
    });

    it('saves a newly chosen place', async () => {
        const onSave = vi.fn(async () => undefined);
        const container = render(undefined, onSave);
        await click(container, 'pe-edit');
        await click(container, 'pe-picker-mode-area');
        await click(container, 'pe-save');

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'area' }));
        // Back to the summary once it lands.
        expect(container.querySelector('[data-testid="pe-form"]')).toBeNull();
    });

    /** Taking something off the map has to be reachable, not just moving it. */
    it('saves null to remove a place', async () => {
        const onSave = vi.fn(async () => undefined);
        const container = render(PIN, onSave);
        await click(container, 'pe-edit');
        await click(container, 'pe-picker-mode-none');
        await click(container, 'pe-save');

        expect(onSave).toHaveBeenCalledWith(null);
    });

    it('reports a refusal and stays open so the edit is not lost', async () => {
        const onSave = vi.fn(async () => {
            throw new Error('Only the resource steward can update it');
        });
        const container = render(PIN, onSave);
        await click(container, 'pe-edit');
        await click(container, 'pe-save');

        expect(container.querySelector('[data-testid="pe-error"]')?.textContent).toContain(
            'Only the resource steward can update it'
        );
        expect(container.querySelector('[data-testid="pe-form"]')).toBeTruthy();
    });

    it('discards the draft on cancel', async () => {
        const onSave = vi.fn(async () => undefined);
        const container = render(PIN, onSave);
        await click(container, 'pe-edit');
        await click(container, 'pe-picker-mode-none');
        await click(container, 'pe-cancel');

        expect(onSave).not.toHaveBeenCalled();
        // The summary still shows the place that was never unset.
        expect(container.querySelector('[data-testid="pe-summary"]')?.textContent).toContain(
            '47.6062'
        );
    });

    it('reopens from the saved place, not from the abandoned draft', async () => {
        const container = render(
            PIN,
            vi.fn(async () => undefined)
        );
        await click(container, 'pe-edit');
        await click(container, 'pe-picker-mode-none');
        await click(container, 'pe-cancel');
        await click(container, 'pe-edit');

        // Pin mode, because that is what is actually stored.
        expect(
            container
                .querySelector('[data-testid="pe-picker-mode-pin"]')
                ?.getAttribute('aria-pressed')
        ).toBe('true');
    });
});
