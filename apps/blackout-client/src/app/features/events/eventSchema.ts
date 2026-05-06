/**
 * `co.bmc.event` Matrix state event used to publish a coalition /
 * canopy / den event. State scope means each canopy/room owns its own
 * event registry and federation hands the events out for free.
 *
 * RSVPs are encoded as `m.reaction` events on the event state itself
 * — `👍` for yes, `❌` for no, `🤔` for maybe — keyed by the
 * reactor's user id so the reaction count IS the RSVP tally.
 */

export const EVENT_STATE_TYPE = 'co.bmc.event' as const;

export type EventVisibility = 'public' | 'members_only' | 'private';

export interface EventStateContent {
    /** Schema marker. */
    version: 1;
    title: string;
    description: string;
    /** ISO-8601 timestamp; required. */
    startsAt: string;
    /** ISO-8601 timestamp; optional (defaults to startsAt + 1h on render). */
    endsAt?: string;
    /** Free-form location string. */
    location?: string;
    /** Optional cover-art mxc URI. */
    coverUrl?: string;
    visibility: EventVisibility;
    tags?: string[];
}

export type RsvpKind = 'yes' | 'no' | 'maybe';

export const RSVP_REACTION_KEY: Record<RsvpKind, string> = {
    yes: '👍',
    no: '❌',
    maybe: '🤔',
};

export const REACTION_KEY_TO_RSVP: Record<string, RsvpKind> = {
    '👍': 'yes',
    '❌': 'no',
    '🤔': 'maybe',
};

const isIsoTimestamp = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const ms = Date.parse(value);
    return Number.isFinite(ms);
};

/**
 * Defensive parser for `co.bmc.event` state content. Returns `null`
 * when the payload is missing required fields so renderers can drop
 * the row instead of crashing on untrusted federated state.
 */
export const parseEventStateContent = (raw: unknown): EventStateContent | null => {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const description = typeof value.description === 'string' ? value.description.trim() : '';
    const startsAt = isIsoTimestamp(value.startsAt) ? value.startsAt : null;
    const visibility =
        value.visibility === 'public' ||
        value.visibility === 'members_only' ||
        value.visibility === 'private'
            ? value.visibility
            : 'public';

    if (!title || !description || !startsAt) return null;

    const content: EventStateContent = {
        version: 1,
        title,
        description,
        startsAt,
        visibility,
    };
    if (isIsoTimestamp(value.endsAt)) content.endsAt = value.endsAt as string;
    if (typeof value.location === 'string' && value.location.trim()) {
        content.location = value.location.trim();
    }
    if (typeof value.coverUrl === 'string') content.coverUrl = value.coverUrl;
    if (Array.isArray(value.tags)) {
        content.tags = (value.tags as unknown[])
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean);
    }
    return content;
};

export interface BuildEventStateInput {
    title: string;
    description: string;
    startsAt: string | Date;
    endsAt?: string | Date;
    location?: string;
    visibility?: EventVisibility;
    tags?: string[];
}

const toIso = (value: string | Date): string =>
    value instanceof Date ? value.toISOString() : value;

export const buildEventStateContent = (input: BuildEventStateInput): EventStateContent => {
    const content: EventStateContent = {
        version: 1,
        title: input.title.trim(),
        description: input.description.trim(),
        startsAt: toIso(input.startsAt),
        visibility: input.visibility ?? 'public',
    };
    if (input.endsAt) content.endsAt = toIso(input.endsAt);
    if (input.location) content.location = input.location;
    if (input.tags && input.tags.length > 0) {
        content.tags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    }
    return content;
};
