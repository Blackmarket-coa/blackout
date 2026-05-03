import type {
    DeadmanSwitchArmedEvent,
    DeadmanSwitchCancelledEvent,
    DeadmanSwitchCheckedInEvent,
    DeadmanSwitchPayload,
    DeadmanSwitchStatus,
    DeadmanSwitchTriggeredEvent,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type ArmDeadmanSwitchInput = {
    roomId: string;
    /**
     * Optional owner override. The server defaults this to the calling
     * subject and rejects mismatches, so most callers should omit it.
     */
    ownerId?: string;
    checkInIntervalSeconds: number;
    gracePeriodSeconds: number;
    recipients: string[];
    encryptedPayload: string;
    headline?: string;
};

export type DeadmanSwitchListResponse = {
    switches: DeadmanSwitchPayload[];
};

export const createDeadmanActions = (client: ApiClient) => ({
    /**
     * Arm a new deadman switch. Server emits a
     * `blackout.deadman.switch.armed` envelope.
     */
    armSwitch: (input: ArmDeadmanSwitchInput) =>
        client<DeadmanSwitchArmedEvent>({
            method: 'POST',
            path: '/v1/deadman/switches',
            body: input,
        }),
    /**
     * Reset the trigger countdown. The status moves back to `armed` and
     * the server emits a `blackout.deadman.switch.checked_in` envelope.
     * `armed` and `grace` switches are both eligible for check-in, so a
     * late check-in can rescue a switch from the grace window.
     */
    checkIn: (switchId: string) =>
        client<DeadmanSwitchCheckedInEvent>({
            method: 'POST',
            path: `/v1/deadman/switches/${encodeURIComponent(switchId)}/check-in`,
        }),
    /**
     * Permanently cancel an armed or grace-window switch. Triggered
     * switches cannot be cancelled (the payload has already shipped).
     */
    cancelSwitch: (switchId: string) =>
        client<DeadmanSwitchCancelledEvent>({
            method: 'POST',
            path: `/v1/deadman/switches/${encodeURIComponent(switchId)}/cancel`,
        }),
    /**
     * Fetch the switches owned by the calling subject (or visible to them
     * as a recipient when `scope=recipient`).
     */
    listSwitches: (scope: 'owner' | 'recipient' = 'owner') =>
        client<DeadmanSwitchListResponse>({
            method: 'GET',
            path: `/v1/deadman/switches?scope=${encodeURIComponent(scope)}`,
        }),
    /**
     * Read a single switch by id.
     */
    getSwitch: (switchId: string) =>
        client<DeadmanSwitchPayload>({
            method: 'GET',
            path: `/v1/deadman/switches/${encodeURIComponent(switchId)}`,
        }),
    /**
     * Manually advance overdue switches. Intended for cron/CLI callers
     * (the server also runs an internal scheduler). Returns the switches
     * whose status changed.
     */
    processOverdue: (now?: string) =>
        client<{ processed: DeadmanSwitchPayload[]; evaluatedAt: string }>({
            method: 'POST',
            path: '/v1/deadman/process-overdue',
            body: now ? { now } : {},
        }),
});

/**
 * Pure helper: returns true when the switch should still allow a
 * check-in (i.e. has not been finally triggered or cancelled).
 */
export const canCheckIn = (status: DeadmanSwitchStatus): boolean =>
    status === 'armed' || status === 'grace';

/**
 * Pure helper: applies a switch envelope payload onto a local snapshot.
 * Inserts when unknown; replaces fields otherwise. Returns a new array.
 */
export const applyDeadmanSwitchUpdate = (
    switches: readonly DeadmanSwitchPayload[],
    payload: DeadmanSwitchPayload
): DeadmanSwitchPayload[] => {
    const existing = switches.find((entry) => entry.switchId === payload.switchId);
    if (!existing) return [...switches, payload];
    return switches.map((entry) =>
        entry.switchId === payload.switchId ? { ...entry, ...payload } : entry
    );
};

export type {
    DeadmanSwitchArmedEvent,
    DeadmanSwitchCancelledEvent,
    DeadmanSwitchCheckedInEvent,
    DeadmanSwitchPayload,
    DeadmanSwitchStatus,
    DeadmanSwitchTriggeredEvent,
};
