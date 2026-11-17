import type { AidPost, CoalitionEvent, EventRsvp } from '@blackout/core';

/**
 * What the coalition read routes show to whom (`routes/coalition.ts`).
 *
 * Until 2026-11-17 every coalition read answered anyone, signed in or not,
 * with everything stored: a mutual-aid post's exact coordinates and street
 * address with its poster's id, every event that was not cancelled (private
 * ones included) with its organizer and full RSVP list, ride offers with the
 * driver's id and where they leave from, and the people behind each need,
 * project and resource. A radius query compared against exact coordinates,
 * so even a coarsened answer could be narrowed to the doorstep by asking
 * again with smaller circles. See
 * `docs/security/coalition-read-privacy-2026-11-17.md`.
 *
 * The rules:
 * - A mutual-aid post's poster sees it whole. Anyone else sees it without the
 *   poster's or fulfiller's id or the street address, at the centre of a grid
 *   cell at least {@link MIN_AID_CELL_METERS} wide (or the post's own display
 *   radius, if larger), and radius queries test that centre, not the spot.
 * - An event that is not public is seen only by its organizer and by people
 *   who have RSVP'd. Events do not record which community a `community` event
 *   belongs to, so no one else can be shown to belong.
 * - An event's RSVP list is the organizer's; anyone else sees their own RSVP.
 * - Nobody signed out is sent a person's id: not an organizer, author, lead,
 *   steward or supporter.
 */

/** The smallest cell a mutual-aid post's location is shown in to anyone but its poster. */
export const MIN_AID_CELL_METERS = 500;

const METERS_PER_DEGREE_LATITUDE = 111_320;

/**
 * The centre of the grid cell, `cellMeters` on a side, that holds a point.
 * Deterministic, so asking again does not narrow it down; columns are sized
 * at the cell row's latitude, so every point in a cell maps to one centre.
 */
export function coarsenPoint(
    latitude: number,
    longitude: number,
    cellMeters: number
): { latitude: number; longitude: number } {
    const latitudeStep = cellMeters / METERS_PER_DEGREE_LATITUDE;
    const row = Math.floor(latitude / latitudeStep);
    const centreLatitude = Math.min(90, Math.max(-90, (row + 0.5) * latitudeStep));
    const cos = Math.max(Math.cos((centreLatitude * Math.PI) / 180), 0.01);
    const longitudeStep = cellMeters / (METERS_PER_DEGREE_LATITUDE * cos);
    const column = Math.floor(longitude / longitudeStep);
    let centreLongitude = (column + 0.5) * longitudeStep;
    if (centreLongitude > 180) centreLongitude -= 360;
    if (centreLongitude < -180) centreLongitude += 360;
    return { latitude: centreLatitude, longitude: centreLongitude };
}

/** A mutual-aid post as someone other than its poster sees it. */
export type AidPostView = Omit<AidPost, 'customerId' | 'fulfillerId'> &
    Partial<Pick<AidPost, 'customerId' | 'fulfillerId'>>;

/** The post as `viewerId` may see it (see the rules above). */
export function aidPostForViewer(post: AidPost, viewerId: string | null): AidPostView {
    if (viewerId && post.customerId === viewerId) return post;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customerId, fulfillerId, location, ...rest } = post;
    if (!location) return rest;
    const cellMeters = Math.max(MIN_AID_CELL_METERS, post.displayRadiusMeters || 0);
    return {
        ...rest,
        displayRadiusMeters: cellMeters,
        location: coarsenPoint(location.latitude, location.longitude, cellMeters),
    };
}

/** Whether `viewerId` may see the event at all. */
export function canSeeEvent(
    event: Pick<CoalitionEvent, 'visibility' | 'organizerId'>,
    viewerId: string | null,
    rsvps: Pick<EventRsvp, 'userId'>[]
): boolean {
    if (event.visibility === 'public') return true;
    if (!viewerId) return false;
    return event.organizerId === viewerId || rsvps.some((rsvp) => rsvp.userId === viewerId);
}

/** The RSVPs `viewerId` may see: all of them for the organizer, otherwise their own. */
export function rsvpsForViewer<T extends Pick<EventRsvp, 'userId'>>(
    event: Pick<CoalitionEvent, 'organizerId'>,
    viewerId: string | null,
    rsvps: T[]
): T[] {
    if (!viewerId) return [];
    if (event.organizerId === viewerId) return rsvps;
    return rsvps.filter((rsvp) => rsvp.userId === viewerId);
}

/**
 * `record` without the named person fields when no one is signed in; as it is
 * otherwise. The fields are dropped, not blanked, so a client cannot mistake
 * an empty string for an id.
 */
export function withoutPeopleWhenSignedOut<T extends object, K extends keyof T>(
    record: T,
    viewerId: string | null,
    keys: readonly K[]
): T | Omit<T, K> {
    if (viewerId) return record;
    const copy = { ...record };
    for (const key of keys) delete copy[key];
    return copy;
}
