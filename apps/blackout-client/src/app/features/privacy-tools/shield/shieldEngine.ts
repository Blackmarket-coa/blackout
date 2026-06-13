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

/** Permission states the audit cares about (subset of the DOM PermissionState). */
export type ShieldPermissionState = 'granted' | 'denied' | 'prompt';

export type ShieldFormDescriptor = {
    /** The form's `action` URL (may be relative, absolute, or empty). */
    action: string;
    method?: string;
};

export type ShieldScanInput = {
    /** Resource URLs observed on the page (e.g. performance resource entries). */
    resourceUrls?: readonly string[];
    /** Fingerprinting-relevant API identifiers the host reports as accessed. */
    accessedApis?: readonly string[];
    /** Device-permission states queried from `navigator.permissions`. */
    permissions?: { camera?: ShieldPermissionState; microphone?: ShieldPermissionState };
    /** Forms on the page, audited for cross-origin (third-party) actions. */
    forms?: readonly ShieldFormDescriptor[];
    /** This page's origin, used to decide whether a form action is third-party. */
    pageOrigin?: string;
};

const SEVERITY_BY_CATEGORY: Record<ShieldCategory, ShieldSeverity> = {
    'session-replay': 'high',
    fingerprinting: 'high',
    'form-exfil': 'high',
    advertising: 'warn',
    tracker: 'warn',
    pixel: 'warn',
    permission: 'info',
};

const emptySummary = (): Record<ShieldCategory, number> => ({
    'session-replay': 0,
    tracker: 0,
    advertising: 0,
    fingerprinting: 0,
    pixel: 0,
    permission: 0,
    'form-exfil': 0,
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
 * Surface a device permission that this origin currently holds. Only `granted`
 * is reported (an informational "this site can use your camera/mic"); `prompt`
 * and `denied` are not findings.
 */
export const auditPermission = (
    device: 'camera' | 'microphone',
    state: ShieldPermissionState | undefined,
): ShieldFinding | null => {
    if (state !== 'granted') return null;
    return {
        category: 'permission',
        label: device === 'camera' ? 'Camera access granted' : 'Microphone access granted',
        detail: device,
        severity: SEVERITY_BY_CATEGORY.permission,
    };
};

/**
 * Flag a form whose `action` resolves to a different origin than the page — a
 * cross-origin submission can exfiltrate form data to a third party. Relative
 * / same-origin / empty actions are not findings.
 */
export const auditFormAction = (
    form: ShieldFormDescriptor,
    pageOrigin: string | undefined,
): ShieldFinding | null => {
    const action = form.action?.trim();
    if (!action) return null;
    let actionUrl: URL;
    try {
        actionUrl = pageOrigin ? new URL(action, pageOrigin) : new URL(action);
    } catch {
        return null; // relative action with no base, or unparseable → same-origin
    }
    if (pageOrigin && actionUrl.origin === pageOrigin) return null;
    if (!pageOrigin) return null; // can't determine cross-origin without a base
    return {
        category: 'form-exfil',
        label: `${(form.method || 'GET').toUpperCase()} form posts off-site`,
        detail: actionUrl.host,
        severity: SEVERITY_BY_CATEGORY['form-exfil'],
    };
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
    if (input.permissions) {
        push(auditPermission('camera', input.permissions.camera));
        push(auditPermission('microphone', input.permissions.microphone));
    }
    for (const form of input.forms ?? []) push(auditFormAction(form, input.pageOrigin));

    return { findings, summary, total: findings.length };
};
