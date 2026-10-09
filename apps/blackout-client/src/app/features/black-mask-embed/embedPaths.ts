/**
 * Path helpers for the Black Mask chat panel (launch-plan step B1).
 *
 * Pure functions only — no Matrix client, no DOM — so the panel's scoping
 * rules are unit-testable on their own. The route constants live with the
 * rest of the app's paths in `pages/paths.ts`.
 */
import {
    COMMUNITIES_NO_CANOPY_SENTINEL,
    EMBED_ELSEWHERE_PATH,
    EMBED_PATH,
} from '../../pages/paths';

/**
 * True for `/embed` and anything under `/embed/`. Must agree with the web
 * server's panel locations (`location = /embed` and `location ^~ /embed/` in
 * `apps/blackout-client/docker-nginx.conf`); a test pins the two together.
 * `/embedded` is deliberately not a panel path.
 */
export const isEmbedPath = (pathname: string): boolean =>
    pathname === EMBED_PATH || pathname.startsWith(`${EMBED_PATH}/`);

const enc = encodeURIComponent;

export const buildEmbedCanopyPath = (canopyId: string): string =>
    `${EMBED_PATH}/canopies/${enc(canopyId)}`;

/** A den inside a canopy, or a loose den when `canopyId` is null. */
export const buildEmbedDenPath = (canopyId: string | null, denId: string): string =>
    canopyId
        ? `${EMBED_PATH}/canopies/${enc(canopyId)}/dens/${enc(denId)}`
        : `${EMBED_PATH}/dens/${enc(denId)}`;

export const buildEmbedDmPath = (roomId: string): string => `${EMBED_PATH}/dms/${enc(roomId)}`;

export const buildEmbedElsewherePath = (target: string): string =>
    `${EMBED_ELSEWHERE_PATH}?to=${enc(target)}`;

/** Canonical (full-app) addresses for the things the panel shows, for "Open in Blackout". */
export const canonicalCanopyPath = (canopyId: string): string => `/communities/${enc(canopyId)}`;
export const canonicalDenPath = (canopyId: string | null, denId: string): string =>
    `/communities/${canopyId ? enc(canopyId) : COMMUNITIES_NO_CANOPY_SENTINEL}/dens/${enc(denId)}`;
export const canonicalDmPath = (roomId: string): string => `/messages/locked-in/${enc(roomId)}/`;

const segmentsOf = (pathname: string): string[] =>
    pathname.split('/').filter((segment) => segment.length > 0);

/**
 * Map a full-app path onto the panel address that shows the same thing, or
 * return null when the panel does not show it.
 *
 * In scope: the canopy list (`/communities`, `/canopies`), one canopy
 * (`/communities/:canopyId`), one den (`/communities/:canopyId/dens/:denId`,
 * with `-` for a den outside any canopy), the DM list (`/messages/locked-in/`)
 * and one DM (`/messages/locked-in/:roomIdOrAlias/...`). Everything else —
 * Town Square (`/`), Coliseum, Market, feeds, settings, DM creation — is out
 * of scope and returns null.
 *
 * Path segments are passed through as they arrive (still URI-encoded).
 */
export const mapToEmbedPath = (pathname: string): string | null => {
    if (isEmbedPath(pathname)) return pathname;
    const s = segmentsOf(pathname);
    if (s.length === 0) return null;

    if (s[0] === 'canopies' && s.length === 1) return EMBED_PATH;

    if (s[0] === 'communities') {
        if (s.length === 1) return EMBED_PATH;
        const canopy = s[1];
        if (s.length === 2) {
            return canopy === COMMUNITIES_NO_CANOPY_SENTINEL
                ? EMBED_PATH
                : `${EMBED_PATH}/canopies/${canopy}`;
        }
        if (s.length === 4 && s[2] === 'dens') {
            return canopy === COMMUNITIES_NO_CANOPY_SENTINEL
                ? `${EMBED_PATH}/dens/${s[3]}`
                : `${EMBED_PATH}/canopies/${canopy}/dens/${s[3]}`;
        }
        return null;
    }

    if (s[0] === 'messages' && s[1] === 'locked-in') {
        if (s.length === 2) return EMBED_PATH;
        // `/messages/locked-in/create/` starts a new DM: not part of the panel.
        if (s[2] === 'create') return null;
        // `/messages/locked-in/:roomIdOrAlias/:eventId?/`
        if (s.length <= 4) return `${EMBED_PATH}/dms/${s[2]}`;
        return null;
    }

    return null;
};

/**
 * Validate the `?to=` target of the "elsewhere" card. Only a same-origin
 * absolute path is accepted, so a crafted panel URL cannot turn the card's
 * "Open in Blackout" button into a link to another site. Returns the full
 * same-origin URL, or null.
 */
export const resolveElsewhereTarget = (raw: string | null, origin: string): string | null => {
    if (!raw) return null;
    // Must be an absolute path: not protocol-relative (`//host`), not a
    // backslash variant browsers normalise to one (`/\host`), no scheme.
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
    // Whitespace and control characters are stripped or reinterpreted by the
    // URL parser; refuse them rather than reason about what they become.
    if (/\s/.test(raw) || Array.from(raw).some((ch) => ch.charCodeAt(0) < 0x20)) return null;
    try {
        const url = new URL(raw, origin);
        if (url.origin !== origin) return null;
        // Never offer to "open in Blackout" a panel address.
        if (isEmbedPath(url.pathname)) return null;
        return url.toString();
    } catch {
        return null;
    }
};
