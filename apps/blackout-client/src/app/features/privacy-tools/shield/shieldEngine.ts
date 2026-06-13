/**
 * Shield detection engine (OSS-manifest group G1). Pure, side-effect-free
 * classification of observed page activity against the first-party signature
 * list. The component layer collects inputs (resource URLs, accessed APIs,
 * permission states) and renders the report; all decision logic lives here so
 * it is unit-testable in isolation.
 *
 * The engine only *surfaces* findings — it never blocks, rewrites, or signals
 * third parties (manifest §4).
 */

import {
    DOMAIN_SIGNATURES,
    FINGERPRINTING_APIS,
    PIXEL_SIGNATURES,
    type ShieldCategory,
} from './signatures';

export type ShieldSeverity = 'info' | 'warn' | 'high';

export type ShieldFinding = {
    category: ShieldCategory;
    label: string;
    detail: string;
    severity: ShieldSeverity;
};

export type ShieldReport = {
    findings: ShieldFinding[];
    summary: Record<ShieldCategory, number>;
    total: number;
};

export type ShieldScanInput = {
    /** Resource URLs observed on the page (e.g. performance resource entries). */
    resourceUrls?: readonly string[];
    /** Fingerprinting-relevant API identifiers the host reports as accessed. */
    accessedApis?: readonly string[];
};

const SEVERITY_BY_CATEGORY: Record<ShieldCategory, ShieldSeverity> = {
    'session-replay': 'high',
    fingerprinting: 'high',
    advertising: 'warn',
    tracker: 'warn',
    pixel: 'warn',
};

const emptySummary = (): Record<ShieldCategory, number> => ({
    'session-replay': 0,
    tracker: 0,
    advertising: 0,
    fingerprinting: 0,
    pixel: 0,
});

const hostnameOf = (url: string): string | null => {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
};

/** True when `hostname` is the signature domain or a subdomain of it. */
export const hostMatchesDomain = (hostname: string, domain: string): boolean =>
    hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * Classify a single resource URL. Domain signatures take precedence; a URL
 * that matches no domain is checked against the pixel/beacon path signatures.
 * Returns null when nothing matches.
 */
export const classifyResource = (url: string): ShieldFinding | null => {
    const hostname = hostnameOf(url);
    if (hostname) {
        for (const sig of DOMAIN_SIGNATURES) {
            if (hostMatchesDomain(hostname, sig.domain)) {
                return {
                    category: sig.category,
                    label: sig.label,
                    detail: hostname,
                    severity: SEVERITY_BY_CATEGORY[sig.category],
                };
            }
        }
    }

    const lower = url.toLowerCase();
    for (const pixel of PIXEL_SIGNATURES) {
        if (lower.includes(pixel.match)) {
            return {
                category: 'pixel',
                label: pixel.label,
                detail: hostname ?? url,
                severity: SEVERITY_BY_CATEGORY.pixel,
            };
        }
    }
    return null;
};

const classifyApi = (api: string): ShieldFinding | null => {
    const normalized = api.toLowerCase();
    for (const fp of FINGERPRINTING_APIS) {
        if (normalized === fp.api.toLowerCase()) {
            return {
                category: 'fingerprinting',
                label: fp.label,
                detail: fp.api,
                severity: SEVERITY_BY_CATEGORY.fingerprinting,
            };
        }
    }
    return null;
};

/**
 * Run a full shield scan over the supplied observations. Findings are
 * de-duplicated by (category, detail) so a tracker loaded ten times surfaces
 * once.
 */
export const runShieldScan = (input: ShieldScanInput): ShieldReport => {
    const seen = new Set<string>();
    const findings: ShieldFinding[] = [];
    const summary = emptySummary();

    const push = (finding: ShieldFinding | null) => {
        if (!finding) return;
        const key = `${finding.category}|${finding.detail}`;
        if (seen.has(key)) return;
        seen.add(key);
        findings.push(finding);
        summary[finding.category] += 1;
    };

    for (const url of input.resourceUrls ?? []) push(classifyResource(url));
    for (const api of input.accessedApis ?? []) push(classifyApi(api));

    return { findings, summary, total: findings.length };
};
