/**
 * Coalition Events: scheduled community gatherings that surface on the spatial
 * map ('events' layer) and carry RSVPs, optional recurrence, and an optional
 * attached "den" (Matrix room) that lives on after the event for continued
 * organizing. Distinct from `events.ts`, which models the Coalition room's
 * Matrix state (tab config).
 *
 * Temporal status (upcoming/live/past) is DERIVED per occurrence via
 * deriveSpatialEventStatus; the stored `status` is only the lifecycle flag
 * (scheduled vs cancelled).
 */
import { deriveSpatialEventStatus, type SpatialEventStatus } from './eventStatus';

export const EVENT_CATEGORIES = [
    'community',
    'mutual_aid',
    'assembly',
    'protest',
    'workshop',
    'social',
    'cleanup',
    'food',
    'other',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_VISIBILITY = ['public', 'community', 'private'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

/** Lifecycle flag. Temporal upcoming/live/past is derived, not stored. */
export const EVENT_LIFECYCLE_STATUSES = ['scheduled', 'cancelled'] as const;
export type EventLifecycleStatus = (typeof EVENT_LIFECYCLE_STATUSES)[number];

export const RSVP_STATUSES = ['going', 'maybe', 'declined'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface EventRecurrence {
    frequency: RecurrenceFrequency;
    /** Repeat every `interval` units of `frequency` (>= 1). */
    interval: number;
    /** Inclusive ISO upper bound for occurrences. */
    until?: string;
    /** Max number of occurrences including the first. */
    count?: number;
}

export interface EventLocation {
    latitude: number;
    longitude: number;
    address?: string;
}

export interface CoalitionEvent {
    id: string;
    organizerId: string;
    title: string;
    description: string;
    location: EventLocation;
    /** ISO start of the first (or only) occurrence. */
    startsAt: string;
    /** ISO end of the first occurrence. Duration is reused for every occurrence. */
    endsAt?: string;
    category: EventCategory;
    visibility: EventVisibility;
    status: EventLifecycleStatus;
    /** Attached den (Matrix room id) for chat before/after the event. */
    denId?: string;
    capacity?: number;
    recurrence?: EventRecurrence;
}

export interface EventRsvp {
    id: string;
    eventId: string;
    userId: string;
    status: RsvpStatus;
}

export interface EventOccurrence {
    startsAt: string;
    endsAt?: string;
    /** 0-based index from the first occurrence. */
    index: number;
    status: SpatialEventStatus;
}

export interface RsvpSummary {
    going: number;
    maybe: number;
    declined: number;
}

export function isEventCategory(value: unknown): value is EventCategory {
    return typeof value === 'string' && (EVENT_CATEGORIES as readonly string[]).includes(value);
}
export function isEventVisibility(value: unknown): value is EventVisibility {
    return typeof value === 'string' && (EVENT_VISIBILITY as readonly string[]).includes(value);
}
export function isRsvpStatus(value: unknown): value is RsvpStatus {
    return typeof value === 'string' && (RSVP_STATUSES as readonly string[]).includes(value);
}
export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
    return (
        typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
    );
}

export function summarizeRsvps(rsvps: readonly Pick<EventRsvp, 'status'>[]): RsvpSummary {
    const summary: RsvpSummary = { going: 0, maybe: 0, declined: 0 };
    for (const rsvp of rsvps) summary[rsvp.status] += 1;
    return summary;
}

function addRecurrenceStep(start: Date, frequency: RecurrenceFrequency, units: number): Date {
    const next = new Date(start.getTime());
    if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + units);
    else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + units * 7);
    else next.setUTCMonth(next.getUTCMonth() + units);
    return next;
}

const MAX_OCCURRENCES = 366;

/**
 * Expand an event's occurrences that intersect [windowStartMs, windowEndMs].
 * Non-recurring events yield at most one occurrence. Bounded by the recurrence
 * `count`/`until` and a hard cap so a pathological rule can't run away.
 */
export function expandOccurrences(
    event: Pick<CoalitionEvent, 'startsAt' | 'endsAt' | 'recurrence'>,
    windowStartMs: number,
    windowEndMs: number,
    nowMs: number = Date.now(),
): EventOccurrence[] {
    const baseStart = Date.parse(event.startsAt);
    if (Number.isNaN(baseStart)) return [];
    const baseEnd = event.endsAt ? Date.parse(event.endsAt) : NaN;
    const durationMs = Number.isNaN(baseEnd) ? 0 : Math.max(0, baseEnd - baseStart);

    const recurrence = event.recurrence;
    const interval = recurrence ? Math.max(1, Math.floor(recurrence.interval)) : 1;
    const untilMs = recurrence?.until ? Date.parse(recurrence.until) : Number.POSITIVE_INFINITY;
    const maxCount = recurrence?.count && recurrence.count > 0 ? recurrence.count : MAX_OCCURRENCES;
    const hardCap = recurrence ? Math.min(maxCount, MAX_OCCURRENCES) : 1;

    const occurrences: EventOccurrence[] = [];
    for (let index = 0; index < hardCap; index += 1) {
        const occStart = recurrence
            ? addRecurrenceStep(new Date(baseStart), recurrence.frequency, interval * index).getTime()
            : baseStart;
        if (occStart > untilMs) break;
        if (occStart > windowEndMs) break;
        const occEnd = durationMs > 0 ? occStart + durationMs : undefined;
        const intersectsWindow = (occEnd ?? occStart) >= windowStartMs && occStart <= windowEndMs;
        if (intersectsWindow) {
            const startsAtIso = new Date(occStart).toISOString();
            const endsAtIso = occEnd !== undefined ? new Date(occEnd).toISOString() : undefined;
            occurrences.push({
                startsAt: startsAtIso,
                endsAt: endsAtIso,
                index,
                status: deriveSpatialEventStatus({ startsAt: startsAtIso, endsAt: endsAtIso }, nowMs),
            });
        }
    }
    return occurrences;
}

/**
 * The soonest occurrence that has not yet ended (live or upcoming), used to
 * place a recurring event on the map / sort the list. Falls back to the last
 * occurrence for fully-past events.
 */
export function nextOccurrence(
    event: Pick<CoalitionEvent, 'startsAt' | 'endsAt' | 'recurrence'>,
    nowMs: number = Date.now(),
): EventOccurrence | undefined {
    const baseStartMs = Date.parse(event.startsAt);
    if (Number.isNaN(baseStartMs)) return undefined;
    const twoYearsMs = 1000 * 60 * 60 * 24 * 365 * 2;
    // Anchor the window on the event itself so a far-future or fully-past event
    // still resolves an occurrence; then prefer the soonest live/upcoming one.
    const windowStart = Math.min(baseStartMs, nowMs) - 1;
    const windowEnd = Math.max(baseStartMs, nowMs) + twoYearsMs;
    const occurrences = expandOccurrences(event, windowStart, windowEnd, nowMs);
    if (occurrences.length === 0) return undefined;
    return occurrences.find((o) => o.status !== 'past') ?? occurrences[occurrences.length - 1];
}
