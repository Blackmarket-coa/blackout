// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeadmanSwitchPayload } from '@blackout/protocol';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

import {
    ARMING_CLOSED_NOTE,
    DeadmanSwitchPanel,
    EXISTING_SWITCH_NOTE,
    formatLocalTime,
} from '../../../../src/app/features/deadman/DeadmanSwitchPanel';

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
    encryptedPayload: 'sealed-1',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
};

type CancelBehaviour = 'clears' | 'legacy';

const createFakeApi = (
    switches: DeadmanSwitchPayload[],
    options: { cancel?: CancelBehaviour } = {}
) => {
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
        if (request.method === 'POST' && request.path.endsWith('/cancel')) {
            const switchId = request.path.split('/').at(-2);
            const entry = switches.find((candidate) => candidate.switchId === switchId);
            if (!entry)
                return Promise.reject(new Error(`Request failed (404) for ${request.path}`));
            // What the API returns since cancel clears the payload: the owner's
            // envelope without `encryptedPayload`. A `legacy` server keeps it.
            const { encryptedPayload, ...rest } = entry;
            const payload =
                options.cancel === 'legacy'
                    ? { ...entry, status: 'cancelled' as const }
                    : { ...rest, status: 'cancelled' as const };
            void encryptedPayload;
            return Promise.resolve({
                event: 'blackout.deadman.switch.cancelled',
                roomId: entry.roomId,
                senderId: entry.ownerId,
                occurredAt: new Date().toISOString(),
                payload,
            });
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

const buttonNamed = (container: HTMLElement, label: string) =>
    Array.from(container.querySelectorAll('button')).find((button) => button.textContent === label);

afterEach(() => {
    act(() => {
        roots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('DeadmanSwitchPanel', () => {
    it('loads the owner’s switches once on mount, not in a loop', async () => {
        const api = createFakeApi([]);

        const container = await mount(<DeadmanSwitchPanel apiClient={api.apiClient} />);
        await settle();
        await settle();

        expect(api.fn).toHaveBeenCalledTimes(1);
        expect(api.fn).toHaveBeenCalledWith({ method: 'GET', path: LIST_PATH });
        expect(container.textContent).toContain('You have no switches.');
    });

    it('says arming is closed and points at no SDK call or arming form', async () => {
        const api = createFakeApi([armedSwitch]);

        const container = await mount(<DeadmanSwitchPanel apiClient={api.apiClient} />);
        await settle();

        const text = container.textContent ?? '';
        expect(text).toContain(ARMING_CLOSED_NOTE);
        expect(text).not.toContain('@blackout/sdk');
        expect(text).not.toContain('About arming');
        expect(text).not.toContain('Select a room');
        // Nothing the server does not do (release design §7).
        expect(text).not.toMatch(/end-to-end|guaranteed|your safety|anonymous/i);
    });

    it('describes an existing switch in local time with the wording the design allows', async () => {
        const api = createFakeApi([armedSwitch]);

        const container = await mount(<DeadmanSwitchPanel apiClient={api.apiClient} />);
        await settle();

        const text = container.textContent ?? '';
        expect(text).toContain(
            `Armed. Check in by ${formatLocalTime(armedSwitch.triggerAt)}. ` +
                `If you don't, it releases at ${formatLocalTime(armedSwitch.releaseAt)}.`
        );
        expect(text).toContain(EXISTING_SWITCH_NOTE);
        expect(text).toContain('1 recipient(s) named');
        // Times are shown in the viewer's zone, never as the raw ISO string.
        expect(text).not.toContain('2026-10-12T11:00:00.000Z');
        expect(text).not.toContain('2026-10-12T11:10:00.000Z');
        expect(formatLocalTime('not a date')).toBe('not a date');
    });

    it('keeps the error visible after a failed check-in once effects settle', async () => {
        const api = createFakeApi([armedSwitch]);

        const container = await mount(<DeadmanSwitchPanel apiClient={api.apiClient} />);
        await settle();

        const checkIn = buttonNamed(container, 'Check in');
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

    it('after a cancel, says the text was removed only when the server no longer returns it', async () => {
        const api = createFakeApi([armedSwitch]);

        const container = await mount(<DeadmanSwitchPanel apiClient={api.apiClient} />);
        await settle();

        await act(async () => {
            buttonNamed(container, 'Cancel')?.click();
        });
        await settle();

        const text = container.textContent ?? '';
        expect(text).toContain(
            "Cancelled. The text you supplied was removed from Blackout's database."
        );
        expect(text).not.toContain(EXISTING_SWITCH_NOTE);
        expect(buttonNamed(container, 'Remove message')).toBeUndefined();
        expect(api.fn).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/deadman/switches/sw-1/cancel',
        });
    });

    it('a switch cancelled while its text was kept says so and offers to remove it', async () => {
        const cancelledWithText: DeadmanSwitchPayload = {
            ...armedSwitch,
            switchId: 'sw-legacy',
            status: 'cancelled',
        };
        const api = createFakeApi([cancelledWithText]);

        const container = await mount(<DeadmanSwitchPanel apiClient={api.apiClient} />);
        await settle();

        expect(container.textContent).toContain(
            "Cancelled. The text you supplied is still in Blackout's database."
        );
        const remove = buttonNamed(container, 'Remove message');
        expect(remove).toBeDefined();
        expect(buttonNamed(container, 'Check in')?.disabled).toBe(true);

        await act(async () => {
            remove?.click();
        });
        await settle();

        expect(container.textContent).toContain(
            "Cancelled. The text you supplied was removed from Blackout's database."
        );
        expect(buttonNamed(container, 'Remove message')).toBeUndefined();
    });
});
