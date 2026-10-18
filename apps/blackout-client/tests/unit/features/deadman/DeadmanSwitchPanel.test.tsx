// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeadmanSwitchPayload } from '@blackout/protocol';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

import { DeadmanSwitchPanel } from '../../../../src/app/features/deadman/DeadmanSwitchPanel';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LIST_PATH = '/v1/deadman/switches?scope=owner';

// A runaway refetch loop must fail the test, not hang it: past this many list
// calls in one phase, the fake list call never settles, so nothing re-renders
// and act() can return.
const RUNAWAY_CAP = 25;

const armedSwitch: DeadmanSwitchPayload = {
    switchId: 'sw-1',
    ownerId: 'owner-1',
    roomId: '!room:example.org',
    status: 'armed',
    checkInIntervalSeconds: 3600,
    gracePeriodSeconds: 600,
    lastCheckInAt: '2026-10-12T10:00:00.000Z',
    triggerAt: '2026-10-12T11:00:00.000Z',
    releaseAt: '2026-10-12T11:10:00.000Z',
    recipients: ['recipient-1'],
    headline: 'Backup release',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
};

const createFakeApi = (switches: DeadmanSwitchPayload[]) => {
    let listCallsThisPhase = 0;
    const fn = vi.fn((request: ApiRequest): Promise<unknown> => {
        if (request.method === 'GET' && request.path === LIST_PATH) {
            listCallsThisPhase += 1;
            if (listCallsThisPhase > RUNAWAY_CAP) return new Promise(() => undefined);
            // Fresh objects per response, as a real client parsing JSON returns:
            // a reused array would let React bail out of the re-render and hide
            // a refetch loop.
            return Promise.resolve({ switches: switches.map((entry) => ({ ...entry })) });
        }
        if (request.method === 'POST' && request.path.endsWith('/check-in')) {
            return Promise.reject(new Error(`Request failed (403) for ${request.path}`));
        }
        return Promise.reject(new Error(`Unexpected ${request.method} ${request.path}`));
    });
    return {
        fn,
        apiClient: fn as unknown as ApiClient,
        listCalls: () => fn.mock.calls.filter(([request]) => request.path === LIST_PATH).length,
        startPhase: () => {
            listCallsThisPhase = 0;
        },
    };
};

const roots: ReactDOM.Root[] = [];

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    roots.push(root);
    await act(async () => {
        root.render(ui);
    });
    return container;
};

// Lets every pending effect, promise and follow-up render run out.
const settle = async () => {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
};

afterEach(() => {
    act(() => {
        roots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('DeadmanSwitchPanel', () => {
    it('loads the owner’s switches once on mount, not in a loop', async () => {
        const api = createFakeApi([]);

        const container = await mount(
            <DeadmanSwitchPanel apiClient={api.apiClient} roomId={null} />
        );
        await settle();
        await settle();

        expect(api.fn).toHaveBeenCalledTimes(1);
        expect(api.fn).toHaveBeenCalledWith({ method: 'GET', path: LIST_PATH });
        expect(container.textContent).toContain('No switches armed.');
    });

    it('keeps the error visible after a failed check-in once effects settle', async () => {
        const api = createFakeApi([armedSwitch]);

        const container = await mount(
            <DeadmanSwitchPanel apiClient={api.apiClient} roomId={null} />
        );
        await settle();

        const checkIn = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'Check in'
        );
        expect(checkIn).toBeDefined();

        api.startPhase();
        await act(async () => {
            checkIn?.click();
        });
        await settle();
        await settle();

        const alert = container.querySelector('[role="alert"]');
        expect(alert, 'the check-in error must still be on screen').not.toBeNull();
        expect(alert?.textContent).toContain('Request failed (403)');
        // Nothing refetched the list behind the failure (a refetch is what
        // used to clear the alert).
        expect(api.listCalls()).toBe(1);
        expect(api.fn).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/deadman/switches/sw-1/check-in',
        });
    });
});
