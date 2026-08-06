import type { GeocodeResult } from '@blackout/core';
import { log } from '../telemetry/logger';

/**
 * Address lookup, proxied against an operator-configured geocoder.
 *
 * Proxied rather than called from the browser, following the Tenor precedent
 * (`routes/tenor.ts`). Three reasons, all of which the deployed CSP and this
 * app's posture already imply:
 *
 *   - The shipped `connect-src` is `'self'` plus the API and Matrix hosts. A
 *     browser-side geocoder call would need every operator to widen it.
 *   - The geocoder would otherwise see each user's IP and referer alongside
 *     the address they are typing, which is a precise thing to hand a third
 *     party.
 *   - One server-side rate limit protects a self-hosted Nominatim, which asks
 *     for restraint, far better than hoping each client behaves.
 *
 * There is no default provider. Unset means the feature is off and the route
 * answers 503 — nothing is silently sent anywhere the operator did not choose.
 */

export interface GeocoderConfig {
    /** Absolute URL of the search endpoint, e.g. https://nominatim.example.org/search */
    url: URL;
    /** Query-string parameter carrying the search text. Nominatim uses `q`. */
    queryParam: string;
    /** Extra query pairs the operator wants sent, e.g. `format=jsonv2`. */
    extra: [string, string][];
    userAgent: string;
    timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
export const MAX_GEOCODE_RESULTS = 8;

function parseExtraQuery(raw: string | undefined): [string, string][] {
    if (!raw) return [];
    return [...new URLSearchParams(raw).entries()];
}

/**
 * Read the operator's geocoder settings, or explain why the feature is off.
 *
 * Read per call rather than cached at import so a deployment can turn the
 * feature on without a restart, and so tests can vary it.
 */
export function readGeocoderConfig(): GeocoderConfig | { error: string } {
    const raw = process.env.GEOCODER_URL?.trim();
    if (!raw) return { error: 'GEOCODER_URL is not set' };

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { error: 'GEOCODER_URL is not a valid absolute URL' };
    }
    // Operator config, not user input — but a typo that drops the scheme would
    // otherwise become a request to a path on our own host.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { error: 'GEOCODER_URL must be http or https' };
    }

    const timeout = Number.parseInt(process.env.GEOCODER_TIMEOUT_MS ?? '', 10);
    return {
        url,
        queryParam: process.env.GEOCODER_QUERY_PARAM?.trim() || 'q',
        extra: parseExtraQuery(process.env.GEOCODER_EXTRA_QUERY),
        // Nominatim's usage policy requires an identifying User-Agent and will
        // refuse requests without one.
        userAgent: process.env.GEOCODER_USER_AGENT?.trim() || 'Blackout/1.0 (coalition map)',
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    };
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Nominatim reports coordinates as strings; other services use numbers. */
function readCoordinate(value: unknown): number | null {
    if (isFiniteNumber(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/**
 * Normalize one upstream row.
 *
 * Shaped for Nominatim (`lat`/`lon`/`display_name`), the common self-hostable
 * geocoder, while tolerating the `latitude`/`longitude`/`name` spelling other
 * services use. Anything that does not yield a real coordinate inside the world
 * is dropped rather than passed along — an unplottable result is worse than one
 * fewer suggestion.
 */
export function normalizeGeocodeRow(row: unknown): GeocodeResult | null {
    if (!row || typeof row !== 'object') return null;
    const record = row as Record<string, unknown>;

    const latitude = readCoordinate(record.lat ?? record.latitude);
    const longitude = readCoordinate(record.lon ?? record.lng ?? record.longitude);
    if (latitude === null || longitude === null) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

    const rawLabel = record.display_name ?? record.name ?? record.label;
    const label =
        typeof rawLabel === 'string' && rawLabel.trim().length > 0
            ? rawLabel.trim()
            : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    return { label: label.slice(0, 300), latitude, longitude };
}

export function normalizeGeocodeResponse(payload: unknown): GeocodeResult[] {
    // Nominatim returns a bare array; some services wrap it.
    const rows = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { results?: unknown })?.results)
        ? (payload as { results: unknown[] }).results ?? []
        : [];
    return rows
        .map(normalizeGeocodeRow)
        .filter((result): result is GeocodeResult => result !== null)
        .slice(0, MAX_GEOCODE_RESULTS);
}

export type GeocodeOutcome =
    | { ok: true; results: GeocodeResult[] }
    | { ok: false; code: 'disabled' | 'upstream_error'; message: string };

/**
 * Ask the configured geocoder about a search string.
 *
 * `redirect: 'manual'` for the same reason the Tenor proxy does it: a redirect
 * would take us somewhere the operator did not configure, and failing closed is
 * cheaper than chasing where it went.
 */
export async function geocode(query: string): Promise<GeocodeOutcome> {
    const config = readGeocoderConfig();
    if ('error' in config) {
        return { ok: false, code: 'disabled', message: config.error };
    }

    const target = new URL(config.url.toString());
    for (const [key, value] of config.extra) target.searchParams.set(key, value);
    target.searchParams.set(config.queryParam, query);

    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            method: 'GET',
            redirect: 'manual',
            headers: { accept: 'application/json', 'user-agent': config.userAgent },
            signal: AbortSignal.timeout(config.timeoutMs),
        });
    } catch (err) {
        // The query itself is never logged — it is a user's address.
        log.warn('geocoder: upstream fetch failed', { error: String(err) });
        return { ok: false, code: 'upstream_error', message: 'Address lookup failed.' };
    }

    if (!upstream.ok) {
        log.warn('geocoder: upstream returned an error', { status: upstream.status });
        return { ok: false, code: 'upstream_error', message: 'Address lookup failed.' };
    }

    const body = await upstream.text();
    if (body.length > MAX_RESPONSE_BYTES) {
        log.warn('geocoder: upstream response too large', { bytes: body.length });
        return { ok: false, code: 'upstream_error', message: 'Address lookup failed.' };
    }

    try {
        return { ok: true, results: normalizeGeocodeResponse(JSON.parse(body)) };
    } catch {
        log.warn('geocoder: upstream response was not JSON');
        return { ok: false, code: 'upstream_error', message: 'Address lookup failed.' };
    }
}
