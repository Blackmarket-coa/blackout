export type ColiseumTopicStatus = 'emerging' | 'active' | 'closing' | 'archived';

export interface ColiseumTopicTimeline {
    /** ISO-8601 timestamp the topic was created. */
    createdAt: string;
    /** Optional ISO-8601 timestamp at which voting freezes. After this, status is `closing`. */
    closesAt?: string;
    /** Optional ISO-8601 timestamp at which the topic is archived (read-only). */
    archivesAt?: string;
}

const HOUR_MS = 3_600_000;
const DEFAULT_EMERGING_WINDOW_HOURS = 2;

function parseIsoToEpochMs(value: string | undefined): number | null {
    if (!value) return null;
    const epochMs = Date.parse(value);
    return Number.isNaN(epochMs) ? null : epochMs;
}

export function deriveColiseumTopicStatus(
    timeline: ColiseumTopicTimeline,
    nowEpochMs: number = Date.now(),
    emergingWindowHours: number = DEFAULT_EMERGING_WINDOW_HOURS,
): ColiseumTopicStatus {
    const createdAt = parseIsoToEpochMs(timeline.createdAt);
    const closesAt = parseIsoToEpochMs(timeline.closesAt);
    const archivesAt = parseIsoToEpochMs(timeline.archivesAt);

    if (archivesAt !== null && nowEpochMs >= archivesAt) return 'archived';
    if (closesAt !== null && nowEpochMs >= closesAt) return 'closing';
    if (createdAt !== null && nowEpochMs - createdAt < emergingWindowHours * HOUR_MS) {
        return 'emerging';
    }
    return 'active';
}
