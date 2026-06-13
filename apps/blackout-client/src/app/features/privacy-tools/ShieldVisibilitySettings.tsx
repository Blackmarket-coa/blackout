import { useCallback, useState } from 'react';
import { useShieldFeatures } from './useShieldFeatures';
import {
    runShieldScan,
    type ShieldFormDescriptor,
    type ShieldPermissionState,
    type ShieldReport,
} from './shield/shieldEngine';

type ShieldVisibilitySettingsProps = {
    requestClose?: () => void;
};

const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
};

const severityColor: Record<string, string> = {
    high: 'var(--text-critical, #c0392b)',
    warn: 'var(--text-warning, #b9770e)',
    info: 'var(--text-secondary)',
};

/** Collect resource URLs the browser has already loaded for this document. */
const collectResourceUrls = (): string[] => {
    try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        return entries.map((entry) => entry.name).filter(Boolean);
    } catch {
        return [];
    }
};

/** Collect this page's forms so off-site (cross-origin) actions can be flagged. */
const collectForms = (): ShieldFormDescriptor[] => {
    try {
        return Array.from(document.forms).map((form) => ({
            action: form.getAttribute('action') ?? '',
            method: form.getAttribute('method') ?? 'get',
        }));
    } catch {
        return [];
    }
};

/** Best-effort camera/microphone permission audit via the Permissions API. */
const queryPermissions = async (): Promise<{
    camera?: ShieldPermissionState;
    microphone?: ShieldPermissionState;
}> => {
    const out: { camera?: ShieldPermissionState; microphone?: ShieldPermissionState } = {};
    try {
        const perms = navigator.permissions;
        if (!perms?.query) return out;
        for (const name of ['camera', 'microphone'] as const) {
            try {
                const status = await perms.query({ name: name as PermissionName });
                out[name] = status.state as ShieldPermissionState;
            } catch {
                // Some browsers reject unknown permission names; skip them.
            }
        }
    } catch {
        // Permissions API unavailable.
    }
    return out;
};

/**
 * Shield / visibility surface (OSS-manifest group G1). A free, opt-in detection
 * baseline: it scans the resources this page has loaded against the first-party
 * tracker / session-replay / advertising signature list and surfaces findings.
 * Detection only — nothing is blocked or signalled to third parties (§4).
 */
export function ShieldVisibilitySettings({ requestClose }: ShieldVisibilitySettingsProps = {}) {
    const shield = useShieldFeatures();
    const [report, setReport] = useState<ShieldReport | null>(null);

    const runScan = useCallback(async () => {
        const permissions = await queryPermissions();
        setReport(
            runShieldScan({
                resourceUrls: collectResourceUrls(),
                permissions,
                forms: collectForms(),
                pageOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
            })
        );
    }, []);

    return (
        <section
            style={{ display: 'grid', gap: 12 }}
            data-testid="feature-toggle-shield-visibility"
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Shield · Visibility</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Scan the resources this page has loaded for known trackers, session-replay
                recorders, and advertising beacons. Detection only — Blackout never blocks or
                contacts third parties. Available on every plan ({shield.tier}).
            </p>

            <div style={sectionStyle}>
                <button
                    type="button"
                    data-testid="shield-run-scan"
                    onClick={() => void runScan()}
                    disabled={!shield.enabled}
                >
                    Run shield scan
                </button>
                {report ? (
                    <div
                        style={{ marginTop: 10, display: 'grid', gap: 6 }}
                        data-testid="shield-report"
                    >
                        <strong>
                            {report.total === 0
                                ? 'No known trackers detected on this page.'
                                : `${report.total} item(s) detected`}
                        </strong>
                        {report.findings.map((finding) => (
                            <div
                                key={`${finding.category}-${finding.detail}`}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                }}
                            >
                                <span style={{ color: severityColor[finding.severity] }}>
                                    {finding.label}
                                </span>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {finding.category} · {finding.detail}
                                </small>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export default ShieldVisibilitySettings;
