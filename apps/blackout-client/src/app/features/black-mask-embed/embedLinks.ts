/**
 * Link handling for the Black Mask chat panel.
 *
 * The rule: the panel's frame never navigates away from the panel. A link to
 * something the panel shows (another den or DM) stays in the panel; a link to
 * any other Blackout page opens a normal Blackout tab; a link to another site
 * opens a new tab too. New tabs are opened with `noopener,noreferrer`, so the
 * opened page gets no handle back to the panel and no Referer.
 *
 * External links are NOT checked against anything here. Black Mask's phishing
 * check (launch-plan step B6) is not built; until it is, an external link from
 * the panel is exactly as safe as the same link opened from Blackout itself.
 */
import { mapToEmbedPath } from './embedPaths';

export type EmbedLinkDecision =
    /** Same-origin and shown by the panel: route inside the panel. */
    | { action: 'in-panel'; path: string }
    /** Same-origin Blackout page the panel does not show: new top-level tab. */
    | { action: 'blackout-tab'; url: string }
    /** Another site: new top-level tab. */
    | { action: 'external-tab'; url: string }
    /** Not a web navigation (mailto:, blob:, mxc:, …): leave to the browser. */
    | { action: 'default' }
    /** Unparseable or script URL: swallow the click. */
    | { action: 'ignore' };

/**
 * Set on an anchor (`data-embed-open="tab"`) that must open a normal Blackout
 * tab even though its path is one the panel could map — e.g. "Open in
 * Blackout" for a den the panel does not show, which would otherwise route
 * straight back to the same "not shown" card.
 */
export const EMBED_OPEN_ATTRIBUTE = 'data-embed-open';
export const EMBED_OPEN_IN_TAB = 'tab';

export const decideEmbedLink = (
    href: string,
    origin: string,
    options: { forceTab?: boolean } = {}
): EmbedLinkDecision => {
    let url: URL;
    try {
        url = new URL(href, origin);
    } catch {
        return { action: 'ignore' };
    }
    if (url.protocol === 'javascript:') return { action: 'ignore' };
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { action: 'default' };

    if (url.origin !== origin) return { action: 'external-tab', url: url.toString() };

    const mapped = options.forceTab ? null : mapToEmbedPath(url.pathname);
    if (mapped) return { action: 'in-panel', path: `${mapped}${url.search}${url.hash}` };
    return { action: 'blackout-tab', url: url.toString() };
};

/** Open `url` as a new top-level browsing context with no opener and no referrer. */
export const openInNewTopLevelTab = (url: string): void => {
    window.open(url, '_blank', 'noopener,noreferrer');
};
