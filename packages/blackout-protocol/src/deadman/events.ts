import type { EventEnvelope } from '../common/types';

/**
 * Dead-man switch contracts.
 *
 * A dead-man switch holds a payload the owner supplied and fires (moves to
 * `triggered`) when its owner stops checking in: a check-in resets the
 * countdown to `triggerAt`; missing it moves the switch into a grace window
 * that ends at `releaseAt`; missing that moves the switch to `triggered`. The
 * server keeps the timer and changes the status. It does not publish or
 * deliver the payload, notifies nobody, and never decrypts what it holds; it
 * also cannot tell whether what it holds is ciphertext.
 *
 * Status lifecycle:
 *   armed -> grace -> triggered
 *           ^----- (cancelled at any time before triggered)
 *
 * Cancelling a switch clears the payload, and so does deleting its owner's
 * account for a switch that has not fired; a fired switch keeps it for the
 * people it named.
 *
 * Arming is closed until the API can release a message to the people the
 * owner names (`POST /v1/deadman/switches` answers 409 `arming_unavailable`);
 * `docs/security/deadman-release-design-2026-10-24.md` is the plan. Nothing
 * mirrors a switch into Matrix room state: room state is never encrypted.
 */

export type DeadmanSwitchStatus = 'armed' | 'grace' | 'triggered' | 'cancelled';

/**
 * A switch as its owner sees it. The API returns this view to the owner
 * only; a recipient gets `DeadmanReleasedSwitch`, and only after the trigger.
 */
export interface DeadmanSwitchPayload {
    /** Stable switch id (server-issued). */
    switchId: string;
    /** Owner of the switch (the subject who must check in). */
    ownerId: string;
    /** Room the switch was armed with. Any string; nothing checked it. */
    roomId: string;
    /** Current lifecycle status. */
    status: DeadmanSwitchStatus;
    /** Heartbeat interval in seconds. */
    checkInIntervalSeconds: number;
    /** Grace period in seconds, applied after the trigger deadline elapses. */
    gracePeriodSeconds: number;
    /** ISO-8601 of the most recent successful check-in. */
    lastCheckInAt: string;
    /** ISO-8601 deadline; missing it moves the switch into `grace`. */
    triggerAt: string;
    /** ISO-8601 deadline for the grace window; missing it moves the switch to `triggered`. */
    releaseAt: string;
    /**
     * The strings the switch was armed with. The API matches each against
     * Blackout account ids: a recipient written as a Matrix id or a room id
     * matches nobody. Shown to the owner only; a recipient never learns who
     * else is named.
     */
    recipients: string[];
    /**
     * The payload as the owner supplied it; the server never decrypts it.
     * Present while the store still holds one: cancelling the switch clears
     * it (as deleting the owner's account does for a switch that has not
     * fired), so a cancelled switch's view has no payload unless it was
     * cancelled before cancel cleared them.
     */
    encryptedPayload?: string;
    /** Optional label. Shown to the owner only. */
    headline?: string;
    /** ISO-8601 creation timestamp. */
    createdAt: string;
    /** ISO-8601 timestamp of the last status change. */
    updatedAt: string;
}

/**
 * A switch as one of its recipients sees it, and only once it has triggered.
 * Before that the API answers a recipient exactly as it answers a stranger,
 * so this view is the first thing a recipient learns about a switch. It
 * carries no check-in history, interval, room, label or other recipients.
 */
export interface DeadmanReleasedSwitch {
    switchId: string;
    ownerId: string;
    status: 'triggered';
    /** ISO-8601 moment the switch was due to release. */
    releaseAt: string;
    /** The payload as the owner supplied it; the server never decrypts it. */
    encryptedPayload: string;
}

export type DeadmanSwitchArmedEvent = EventEnvelope<
    'blackout.deadman.switch.armed',
    DeadmanSwitchPayload
>;

export type DeadmanSwitchCheckedInEvent = EventEnvelope<
    'blackout.deadman.switch.checked_in',
    DeadmanSwitchPayload
>;

export type DeadmanSwitchGraceEvent = EventEnvelope<
    'blackout.deadman.switch.grace',
    DeadmanSwitchPayload
>;

export type DeadmanSwitchTriggeredEvent = EventEnvelope<
    'blackout.deadman.switch.triggered',
    DeadmanSwitchPayload
>;

export type DeadmanSwitchCancelledEvent = EventEnvelope<
    'blackout.deadman.switch.cancelled',
    DeadmanSwitchPayload
>;

export const DEADMAN_EVENT_NAMES = {
    armed: 'blackout.deadman.switch.armed',
    checkedIn: 'blackout.deadman.switch.checked_in',
    grace: 'blackout.deadman.switch.grace',
    triggered: 'blackout.deadman.switch.triggered',
    cancelled: 'blackout.deadman.switch.cancelled',
} as const;

export type DeadmanEventName = typeof DEADMAN_EVENT_NAMES[keyof typeof DEADMAN_EVENT_NAMES];

const DEADMAN_STATUSES: readonly DeadmanSwitchStatus[] = [
    'armed',
    'grace',
    'triggered',
    'cancelled',
];

const isDeadmanEnvelope = (
    value: unknown
): value is {
    roomId: string;
    senderId: string;
    occurredAt: string;
    event: string;
    payload: unknown;
} => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<{
        roomId: string;
        senderId: string;
        occurredAt: string;
        event: string;
    }>;
    return (
        typeof candidate.roomId === 'string' &&
        typeof candidate.senderId === 'string' &&
        typeof candidate.occurredAt === 'string' &&
        typeof candidate.event === 'string'
    );
};

const isDeadmanPayload = (payload: unknown): payload is DeadmanSwitchPayload => {
    if (!payload || typeof payload !== 'object') return false;
    const candidate = payload as Partial<DeadmanSwitchPayload>;
    return (
        typeof candidate.switchId === 'string' &&
        typeof candidate.ownerId === 'string' &&
        typeof candidate.roomId === 'string' &&
        typeof candidate.checkInIntervalSeconds === 'number' &&
        typeof candidate.gracePeriodSeconds === 'number' &&
        typeof candidate.lastCheckInAt === 'string' &&
        typeof candidate.triggerAt === 'string' &&
        typeof candidate.releaseAt === 'string' &&
        (candidate.encryptedPayload === undefined ||
            typeof candidate.encryptedPayload === 'string') &&
        Array.isArray(candidate.recipients) &&
        candidate.recipients.every((entry) => typeof entry === 'string') &&
        DEADMAN_STATUSES.includes(candidate.status as DeadmanSwitchStatus)
    );
};

/** The released view a recipient gets: exactly these fields, nothing of the owner's view. */
export const isDeadmanReleasedSwitch = (value: unknown): value is DeadmanReleasedSwitch => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<DeadmanReleasedSwitch>;
    return (
        typeof candidate.switchId === 'string' &&
        typeof candidate.ownerId === 'string' &&
        candidate.status === 'triggered' &&
        typeof candidate.releaseAt === 'string' &&
        typeof candidate.encryptedPayload === 'string'
    );
};

const isDeadmanEventOfType = <TName extends DeadmanEventName>(
    value: unknown,
    name: TName
): value is EventEnvelope<TName, DeadmanSwitchPayload> => {
    if (!isDeadmanEnvelope(value)) return false;
    if (value.event !== name) return false;
    return isDeadmanPayload((value as EventEnvelope<TName, DeadmanSwitchPayload>).payload);
};

export const isDeadmanSwitchArmed = (value: unknown): value is DeadmanSwitchArmedEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.armed);

export const isDeadmanSwitchCheckedIn = (value: unknown): value is DeadmanSwitchCheckedInEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.checkedIn);

export const isDeadmanSwitchGrace = (value: unknown): value is DeadmanSwitchGraceEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.grace);

export const isDeadmanSwitchTriggered = (value: unknown): value is DeadmanSwitchTriggeredEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.triggered);

export const isDeadmanSwitchCancelled = (value: unknown): value is DeadmanSwitchCancelledEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.cancelled);
