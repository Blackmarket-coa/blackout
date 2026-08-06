// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { NeedsTab } from '../../../../src/app/features/coalition/tabs/NeedsTab';

/**
 * A failed post used to vanish.
 *
 * None of the three composers caught their create call, so a rejected request
 * was an unhandled rejection: the button re-enabled and nothing else happened.
 * That got much easier to hit once a place could be attached, since the API
 * rejects a coordinate outside the world.
 */

const createCoalitionNeed = vi.fn();
const refetch = vi.fn();

vi.mock('../../../../src/app/features/coalition/coalitionClient', () => ({
    createCoalitionNeed: (...a: unknown[]) => createCoalitionNeed(...(a as [])),
    updateCoalitionNeed: vi.fn(),
}));

vi.mock('../../../../src/app/features/coalition/hooks/useCoalitionFeed', () => ({
    useCoalitionNeeds: () => ({ data: { needs: [] }, loading: false, error: null, refetch }),
}));

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

const setNativeValue = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

const render = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<NeedsTab scope={{ canopyId: '!c:server' }} />);
    });
    mountedRoots.push(root);
    return container;
};

const submit = async (container: HTMLElement, title: string) => {
    const input = container.querySelector(
        '[data-testid="coalition-need-input"]'
    ) as HTMLInputElement;
    await act(async () => setNativeValue(input, title));
    const form = container.querySelector(
        '[data-testid="coalition-need-composer"]'
    ) as HTMLFormElement;
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const errorText = (container: HTMLElement) =>
    container.querySelector('[data-testid="coalition-need-submit-error"]')?.textContent;

beforeEach(() => {
    vi.clearAllMocks();
    createCoalitionNeed.mockResolvedValue({ need: { id: 'need-1' } });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('NeedsTab — a failed post says so', () => {
    it('surfaces the reason the server gave', async () => {
        createCoalitionNeed.mockRejectedValue(new Error('latitude must be between -90 and 90'));
        const container = render();
        await submit(container, 'Compost');

        expect(errorText(container)).toContain('latitude must be between -90 and 90');
    });

    it('keeps what was typed so it can be corrected and resent', async () => {
        createCoalitionNeed.mockRejectedValue(new Error('nope'));
        const container = render();
        await submit(container, 'Compost');

        // Clearing the field on failure would make the user retype everything.
        const input = container.querySelector(
            '[data-testid="coalition-need-input"]'
        ) as HTMLInputElement;
        expect(input.value).toBe('Compost');
    });

    it('re-enables the composer rather than leaving it stuck pending', async () => {
        createCoalitionNeed.mockRejectedValue(new Error('nope'));
        const container = render();
        await submit(container, 'Compost');

        const button = Array.from(container.querySelectorAll('button')).find(
            (candidate) => candidate.textContent === 'Post'
        );
        expect(button?.disabled).toBe(false);
    });

    it('says nothing when the post succeeds', async () => {
        const container = render();
        await submit(container, 'Compost');

        expect(errorText(container)).toBeUndefined();
        expect(refetch).toHaveBeenCalled();
    });

    it('clears a previous failure on the next attempt', async () => {
        createCoalitionNeed.mockRejectedValueOnce(new Error('nope'));
        const container = render();
        await submit(container, 'Compost');
        expect(errorText(container)).toBeTruthy();

        createCoalitionNeed.mockResolvedValue({ need: { id: 'need-2' } });
        await submit(container, 'Compost again');
        expect(errorText(container)).toBeUndefined();
    });
});
