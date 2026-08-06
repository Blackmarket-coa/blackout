/**
 * Where a coalition thing *is*.
 *
 * Needs, projects and resources are real-world things — a community garden, a
 * tool library, a request for compost — but they had no coordinates, so the map
 * could not show them and they sat in the tool bag instead. This is the geo
 * model that puts them on it.
 *
 * Two shapes, because the honest answer differs by thing:
 *
 * - A **pin** is an address. The greenhouse is at these coordinates; go there.
 * - An **area** is an area of operations. A mutual-aid crew covering the north
 *   side, a delivery radius, a project whose work spans a district. The centre
 *   is a reference point, not a doorstep, and the radius is the actual claim.
 *
 * Modelled as a union rather than "coordinates plus an optional radius" so the
 * distinction survives contact with every reader. A radius of zero and an
 * unspecified radius are not the same statement, and code that branches on
 * `kind` cannot accidentally treat an approximate centre as an address.
 */

import { haversineDistanceMeters, type SellerCoordinates } from './sellerLocation';

export const PLACE_KINDS = ['pin', 'area'] as const;
export type PlaceKind = typeof PLACE_KINDS[number];

interface PlaceBase {
    latitude: number;
    longitude: number;
    /**
     * What someone typed, or a reverse-geocoded address. Display only — never
     * the source of truth for position, which is always the coordinates.
     */
    label?: string;
}

/** An exact spot. Go here. */
export interface PinPlace extends PlaceBase {
    kind: 'pin';
}

/** An area of operations. Somewhere in here, and the radius is the claim. */
export interface AreaPlace extends PlaceBase {
    kind: 'area';
    /** Radius from the centre, in metres. Always positive. */
    radiusMeters: number;
}

export type CoalitionPlace = PinPlace | AreaPlace;

/**
 * Radius options offered in the composer, in kilometres. A block, a
 * neighbourhood, a district, a city, a region — the granularities people
 * actually describe an area of operations in.
 */
export const AREA_RADIUS_OPTIONS_KM = [1, 5, 10, 25, 50] as const;

/** Hard ceiling. Past this an "area of operations" stops meaning anything. */
export const MAX_AREA_RADIUS_METERS = 500_000;

export function isPlaceKind(value: unknown): value is PlaceKind {
    return typeof value === 'string' && (PLACE_KINDS as readonly string[]).includes(value);
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/**
 * Validate an untrusted value as a place.
 *
 * Coordinates are range-checked, not merely finite: a latitude of 91 is a bug
 * or an attack, and letting it through puts a pin somewhere no map can render.
 */
export function isCoalitionPlace(value: unknown): value is CoalitionPlace {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    if (!isPlaceKind(candidate.kind)) return false;
    if (!isFiniteNumber(candidate.latitude) || Math.abs(candidate.latitude) > 90) return false;
    if (!isFiniteNumber(candidate.longitude) || Math.abs(candidate.longitude) > 180) return false;
    if (candidate.label !== undefined && typeof candidate.label !== 'string') return false;
    if (candidate.kind === 'area') {
        return (
            isFiniteNumber(candidate.radiusMeters) &&
            candidate.radiusMeters > 0 &&
            candidate.radiusMeters <= MAX_AREA_RADIUS_METERS
        );
    }
    return candidate.radiusMeters === undefined;
}

/** The place's radius in metres. A pin has none, so this is 0. */
export function placeRadiusMeters(place: CoalitionPlace): number {
    return place.kind === 'area' ? place.radiusMeters : 0;
}

export function placeCoordinates(place: CoalitionPlace): SellerCoordinates {
    return { latitude: place.latitude, longitude: place.longitude };
}

/**
 * Does this place fall inside a viewer's "near me" search?
 *
 * The subtlety that makes areas worth having: an area matches when the two
 * circles **overlap**, not when its centre happens to fall inside the search.
 * A crew with a 20km area of operations centred 15km away genuinely does serve
 * someone searching 5km around themselves — filtering on centre distance would
 * hide exactly the coverage the radius was drawn to express.
 *
 * A pin has no radius, so for pins this collapses to the ordinary
 * point-in-circle test.
 */
export function placeWithinRadius(
    place: CoalitionPlace,
    viewer: SellerCoordinates,
    searchRadiusMeters: number
): boolean {
    const separation = haversineDistanceMeters(placeCoordinates(place), viewer);
    return separation <= searchRadiusMeters + placeRadiusMeters(place);
}

/** Metres per degree of latitude. Constant; longitude's varies with latitude. */
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * A closed ring of `[lng, lat]` points approximating a circle on the ground.
 *
 * MapLibre's `circle` layer sizes its radius in *screen pixels*, so a circle
 * drawn that way keeps its size as you zoom and stops describing any real
 * distance. A polygon is in map coordinates, so it grows and shrinks with the
 * world the way an area of operations should.
 *
 * The equirectangular approximation is accurate well past the radii this is
 * used for and degrades gracefully; near the poles longitude spacing is clamped
 * so the ring cannot blow up as `cos(latitude)` approaches zero.
 */
export function circleRingCoordinates(
    center: SellerCoordinates,
    radiusMeters: number,
    steps = 64
): [number, number][] {
    const safeSteps = Math.max(8, Math.floor(steps));
    const latRadians = (center.latitude * Math.PI) / 180;
    const metersPerDegreeLng = Math.max(1, METERS_PER_DEGREE_LAT * Math.cos(latRadians));
    const deltaLat = radiusMeters / METERS_PER_DEGREE_LAT;
    const deltaLng = radiusMeters / metersPerDegreeLng;

    const ring: [number, number][] = [];
    for (let step = 0; step < safeSteps; step += 1) {
        const angle = (step / safeSteps) * 2 * Math.PI;
        ring.push([
            center.longitude + deltaLng * Math.cos(angle),
            center.latitude + deltaLat * Math.sin(angle),
        ]);
    }
    // GeoJSON polygons must close: last point repeats the first.
    ring.push(ring[0]);
    return ring;
}

/**
 * One candidate from an address lookup.
 *
 * Geocoding is proxied by the API against an operator-configured service, so
 * this is the narrow shape both ends agree on — deliberately not a passthrough
 * of any provider's schema, which would leak that choice into the client and
 * into whatever gets stored.
 */
export interface GeocodeResult {
    /** What to show in the results list, e.g. "Elm St, Seattle, WA". */
    label: string;
    latitude: number;
    longitude: number;
}

/**
 * A chosen search result becomes a pin.
 *
 * A pin rather than an area, because a geocoder answers "where is this
 * address", which is a point. Widening it to a service radius is a separate
 * statement only the person placing it can make.
 */
export function geocodeResultToPlace(result: GeocodeResult): PinPlace {
    return {
        kind: 'pin',
        latitude: result.latitude,
        longitude: result.longitude,
        label: result.label,
    };
}

/** Human-readable radius: "800 m", "5 km", "12.5 km". */
export function formatRadius(radiusMeters: number): string {
    if (radiusMeters < 1000) return `${Math.round(radiusMeters)} m`;
    const km = radiusMeters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/** One-line description of a place, for pin subtitles and list rows. */
export function describePlace(place: CoalitionPlace): string {
    if (place.kind === 'area') {
        const within = `within ${formatRadius(place.radiusMeters)}`;
        return place.label ? `${place.label} · ${within}` : within;
    }
    return place.label ?? `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`;
}
