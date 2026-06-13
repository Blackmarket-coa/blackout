/**
 * First-party tracker / session-replay / advertising signature list for the
 * shield engine (OSS-manifest group G1).
 *
 * This is greenfield, MIT-clean data — a curated list of well-known
 * third-party domains by category. We deliberately do NOT bundle uBlock /
 * EasyList rule sets (GPLv3 / list-license constraints, see manifest §4); the
 * shield only *detects and surfaces* these resources, it never blocks or
 * rewrites third-party behaviour. Domains are matched by registrable-suffix.
 */

export type ShieldCategory =
    | 'session-replay'
    | 'tracker'
    | 'advertising'
    | 'fingerprinting'
    | 'pixel';

export type DomainSignature = {
    /** Matched against the resource hostname (exact or subdomain). */
    domain: string;
    category: Exclude<ShieldCategory, 'fingerprinting' | 'pixel'>;
    label: string;
};

export const DOMAIN_SIGNATURES: readonly DomainSignature[] = [
    // Session-replay / behaviour recording — highest privacy impact.
    { domain: 'hotjar.com', category: 'session-replay', label: 'Hotjar' },
    { domain: 'fullstory.com', category: 'session-replay', label: 'FullStory' },
    { domain: 'logrocket.com', category: 'session-replay', label: 'LogRocket' },
    { domain: 'mouseflow.com', category: 'session-replay', label: 'Mouseflow' },
    { domain: 'smartlook.com', category: 'session-replay', label: 'Smartlook' },
    { domain: 'clarity.ms', category: 'session-replay', label: 'Microsoft Clarity' },
    { domain: 'inspectlet.com', category: 'session-replay', label: 'Inspectlet' },
    { domain: 'luckyorange.com', category: 'session-replay', label: 'Lucky Orange' },
    // Analytics / cross-site trackers.
    { domain: 'google-analytics.com', category: 'tracker', label: 'Google Analytics' },
    { domain: 'googletagmanager.com', category: 'tracker', label: 'Google Tag Manager' },
    { domain: 'segment.io', category: 'tracker', label: 'Segment' },
    { domain: 'segment.com', category: 'tracker', label: 'Segment' },
    { domain: 'mixpanel.com', category: 'tracker', label: 'Mixpanel' },
    { domain: 'amplitude.com', category: 'tracker', label: 'Amplitude' },
    { domain: 'scorecardresearch.com', category: 'tracker', label: 'Scorecard Research' },
    { domain: 'quantserve.com', category: 'tracker', label: 'Quantcast' },
    // Advertising networks.
    { domain: 'doubleclick.net', category: 'advertising', label: 'Google DoubleClick' },
    { domain: 'adnxs.com', category: 'advertising', label: 'AppNexus' },
    { domain: 'adsrvr.org', category: 'advertising', label: 'The Trade Desk' },
    { domain: 'criteo.com', category: 'advertising', label: 'Criteo' },
];

/**
 * Known tracking-pixel paths (web bugs). Matched against the full URL; these
 * are 1×1 beacon endpoints rather than whole domains.
 */
export const PIXEL_SIGNATURES: readonly { match: string; label: string }[] = [
    { match: 'facebook.com/tr', label: 'Meta Pixel' },
    { match: '/pixel?', label: 'Tracking pixel' },
    { match: '/collect?', label: 'Analytics beacon' },
    { match: '/p.gif', label: 'Beacon GIF' },
];

/**
 * Browser APIs whose use is a strong fingerprinting signal. The engine flags
 * these when the host page reports them as accessed.
 */
export const FINGERPRINTING_APIS: readonly { api: string; label: string }[] = [
    { api: 'canvas.toDataURL', label: 'Canvas fingerprinting' },
    { api: 'canvas.getImageData', label: 'Canvas readback' },
    { api: 'webgl.getParameter', label: 'WebGL fingerprinting' },
    { api: 'audiocontext.createOscillator', label: 'AudioContext fingerprinting' },
    { api: 'navigator.enumerateDevices', label: 'Device enumeration' },
];
