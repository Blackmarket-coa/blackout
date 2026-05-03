import type { EventEnvelope } from '../common/types';

/**
 * Deadman switch contracts.
 *
 * A deadman switch arms a payload that fires automatically when its owner
 * stops checking in. The pattern mirrors well-known open source projects
 * (storopoli/dead-man-switch, killcord, ether-dms): a heartbeat resets a
 * trigger countdown; missing the countdown moves the switch into a grace
 * window; missing the grace window publishes the encrypted payload to the
 * configured recipients.
 *
 * Status lifecycle:
 *   armed -> grace -> triggered
 *           ^----- (cancelled at any time before triggered)
 *
 * Servers own the canonical clock and emit envelopes; Matrix-side state
 * events (`co.bmc.deadman.*`) mirror the configuration into rooms so
 * clients can render switch status without polling the API.
 */

export const DEADMAN_EVENT_TYPE = 'co.bmc.deadman';
export const DEADMAN_COMMAND_EVENT_TYPE = 'co.bmc.deadman.command';
export const DEADMAN_SCHEMA_VERSION = 1;

export type DeadmanSwitchStatus = 'armed' | 'grace' | 'triggered' | 'cancelled';

export interface DeadmanSwitchPayload {
    /** Stable switch id (server-issued). */
    switchId: string;
    /** Owner of the switch (the subject who must check in). */
    ownerId: string;
    /** Room the switch was created in. */
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
    /** ISO-8601 deadline for the grace window; missing it triggers release. */
    releaseAt: string;
    /** Recipients (room ids or user ids) that receive the payload on release. */
    recipients: string[];
    /** Opaque encrypted payload; the server never decrypts it. */
    encryptedPayload: string;
    /** Optional human-friendly headline shown in UI before release. */
    headline?: string;
    /** ISO-8601 creation timestamp. */
    createdAt: string;
    /** ISO-8601 timestamp of the last status change. */
    updatedAt: string;
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

export type DeadmanEventName =
    (typeof DEADMAN_EVENT_NAMES)[keyof typeof DEADMAN_EVENT_NAMES];

const DEADMAN_STATUSES: readonly DeadmanSwitchStatus[] = [
    'armed',
    'grace',
    'triggered',
    'cancelled',
];

const isDeadmanEnvelope = (
    value: unknown
): value is { roomId: string; senderId: string; occurredAt: string; event: string; payload: unknown } => {
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
        typeof candidate.encryptedPayload === 'string' &&
        Array.isArray(candidate.recipients) &&
        candidate.recipients.every((entry) => typeof entry === 'string') &&
        DEADMAN_STATUSES.includes(candidate.status as DeadmanSwitchStatus)
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

export const isDeadmanSwitchCheckedIn = (
    value: unknown
): value is DeadmanSwitchCheckedInEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.checkedIn);

export const isDeadmanSwitchGrace = (value: unknown): value is DeadmanSwitchGraceEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.grace);

export const isDeadmanSwitchTriggered = (
    value: unknown
): value is DeadmanSwitchTriggeredEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.triggered);

export const isDeadmanSwitchCancelled = (
    value: unknown
): value is DeadmanSwitchCancelledEvent =>
    isDeadmanEventOfType(value, DEADMAN_EVENT_NAMES.cancelled);
