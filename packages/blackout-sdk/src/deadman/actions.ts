import type {
    DeadmanReleasedSwitch,
    DeadmanSwitchArmedEvent,
    DeadmanSwitchCancelledEvent,
    DeadmanSwitchCheckedInEvent,
    DeadmanSwitchPayload,
    DeadmanSwitchStatus,
    DeadmanSwitchTriggeredEvent,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

/**
 * The body `POST /v1/deadman/switches` took while arming was open. The route
 * now answers 409 `arming_unavailable` to every call, whatever the body, and
 * the format changes when arming reopens with the release
 * (`docs/security/deadman-release-design-2026-10-24.md` §8, PR 3).
 */
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

/** The owner's switches. */
export type DeadmanSwitchListResponse = {
    switches: DeadmanSwitchPayload[];
};

/** The switches released to the caller as a recipient: triggered ones only. */
export type DeadmanReleasedListResponse = {
    switches: DeadmanReleasedSwitch[];
};

export const createDeadmanActions = (client: ApiClient) => ({
    /**
     * Arm a new switch. Refused with 409 `arming_unavailable` until the API
     * can release a message to the people the owner names; the body is not
     * read. Kept so the refusal can be shown, not because it arms anything.
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
     * late check-in can rescue a switch from the grace window. Owner only:
     * anyone else gets 404, whether or not the switch exists.
     */
    checkIn: (switchId: string) =>
        client<DeadmanSwitchCheckedInEvent>({
            method: 'POST',
            path: `/v1/deadman/switches/${encodeURIComponent(switchId)}/check-in`,
        }),
    /**
     * Cancel an armed or grace-window switch. The server clears its payload,
     * so the envelope carries none. Cancelling a cancelled switch clears a
     * payload it still holds (one cancelled before cancel cleared payloads).
     * Triggered switches cannot be cancelled. Owner only: anyone else gets
     * 404, whether or not the switch exists.
     */
    cancelSwitch: (switchId: string) =>
        client<DeadmanSwitchCancelledEvent>({
            method: 'POST',
            path: `/v1/deadman/switches/${encodeURIComponent(switchId)}/cancel`,
        }),
    /**
     * The switches owned by the calling subject.
     */
    listSwitches: () =>
        client<DeadmanSwitchListResponse>({
            method: 'GET',
            path: '/v1/deadman/switches?scope=owner',
        }),
    /**
     * The switches released to the calling subject as a recipient: triggered
     * ones only, each as a `DeadmanReleasedSwitch`. A switch that has not
     * triggered is absent, exactly as it is for someone it does not name.
     */
    listReleasedToMe: () =>
        client<DeadmanReleasedListResponse>({
            method: 'GET',
            path: '/v1/deadman/switches?scope=recipient',
        }),
    /**
     * Read a single switch by id: the owner's view for its owner, the
     * released view for a recipient once it has triggered, and 404 for
     * everyone else, whether or not the switch exists.
     */
    getSwitch: (switchId: string) =>
        client<DeadmanSwitchPayload | DeadmanReleasedSwitch>({
            method: 'GET',
            path: `/v1/deadman/switches/${encodeURIComponent(switchId)}`,
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
 * Fields the envelope leaves out keep the snapshot's value, so after a
 * cancel, which drops `encryptedPayload`, replace the entry instead.
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
    DeadmanReleasedSwitch,
    DeadmanSwitchArmedEvent,
    DeadmanSwitchCancelledEvent,
    DeadmanSwitchCheckedInEvent,
    DeadmanSwitchPayload,
    DeadmanSwitchStatus,
    DeadmanSwitchTriggeredEvent,
};
