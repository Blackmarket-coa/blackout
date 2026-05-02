export type SpatialEventStatus = 'upcoming' | 'live' | 'past';

export interface SpatialEventTimeline {
    startsAt: string;
    endsAt?: string;
}

function parseIsoToEpochMs(value: string | undefined): number | null {
    if (!value) return null;
    const epochMs = Date.parse(value);
    return Number.isNaN(epochMs) ? null : epochMs;
}

export function deriveSpatialEventStatus(
    timeline: SpatialEventTimeline,
    nowEpochMs: number = Date.now(),
): SpatialEventStatus {
    const startsAt = parseIsoToEpochMs(timeline.startsAt);
    const endsAt = parseIsoToEpochMs(timeline.endsAt);

    if (startsAt === null) return 'upcoming';
    if (nowEpochMs < startsAt) return 'upcoming';
    if (endsAt !== null && nowEpochMs >= endsAt) return 'past';
    return 'live';
}
