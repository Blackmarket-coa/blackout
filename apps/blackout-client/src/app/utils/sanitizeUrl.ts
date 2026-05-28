/**
 * Tracking-parameter stripping for outbound message links.
 *
 * Removes known analytics/click-tracking query parameters from URLs so that
 * links shared in chat don't leak attribution identifiers to the recipient's
 * referer chain or to the destination's analytics. Self-contained (no external
 * ruleset) — the param list below covers the common ad/analytics ecosystems.
 */

/** Exact-match tracking params (case-insensitive). */
const TRACKING_PARAMS = new Set<string>([
    'fbclid',
    'gclid',
    'gclsrc',
    'dclid',
    'msclkid',
    'mc_eid',
    'mc_cid',
    'igshid',
    'igsh',
    'yclid',
    'vero_id',
    '_hsenc',
    '_hsmi',
    'twclid',
    'wickedid',
    's_kwcid',
    'ref_src',
]);

/** Prefix-matched tracking params (e.g. all `utm_*`). */
const TRACKING_PREFIXES = ['utm_'];

const isTrackingParam = (key: string): boolean => {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) return true;
    return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
};

/**
 * Strip tracking params from a single URL string. Returns the input unchanged
 * if it isn't a parseable absolute http(s) URL.
 */
export const sanitizeUrl = (url: string): string => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return url;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;

    const keys = Array.from(parsed.searchParams.keys());
    let changed = false;
    for (const key of keys) {
        if (isTrackingParam(key)) {
            parsed.searchParams.delete(key);
            changed = true;
        }
    }
    if (!changed) return url;

    // Avoid a dangling "?" when all params were stripped.
    if (Array.from(parsed.searchParams.keys()).length === 0) {
        parsed.search = '';
    }
    return parsed.toString();
};

const URL_PATTERN = /https?:\/\/[^\s<]+/g;

/** Strip tracking params from every http(s) URL found in a plain-text body. */
export const sanitizeUrlsInText = (text: string): string =>
    text.replace(URL_PATTERN, (match) => {
        // Trailing punctuation (e.g. a sentence-ending ".") shouldn't be parsed
        // as part of the URL; peel it off, sanitize, then reattach.
        const trailingMatch = match.match(/[).,;!?]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const core = trailing ? match.slice(0, match.length - trailing.length) : match;
        return sanitizeUrl(core) + trailing;
    });

const HREF_PATTERN = /href="([^"]*)"/g;

/** Strip tracking params from `href="..."` values inside an HTML formatted body. */
export const sanitizeFormattedBody = (html: string): string =>
    html.replace(HREF_PATTERN, (_match, href: string) => `href="${sanitizeUrl(href)}"`);
