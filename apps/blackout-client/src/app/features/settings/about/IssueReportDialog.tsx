import React, { useEffect, useMemo, useState } from 'react';
import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import { trackSettingsInteraction } from '../settingsTelemetry';

const APP_VERSION = '4.10.5';

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
};

const dialogStyle: React.CSSProperties = {
    background: 'var(--bg-surface, #1f2937)',
    color: 'var(--text-primary, #f8fafc)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    padding: 20,
    minWidth: 420,
    maxWidth: 'min(640px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    display: 'grid',
    gap: 12,
};

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    padding: '6px 12px',
    background: 'var(--bg-input, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'white',
};

const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 140,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    fontFamily: 'inherit',
    fontSize: 14,
    resize: 'vertical',
    boxSizing: 'border-box',
};

// Mirrors the server-side scrubbers in services/diagnosticsRedaction.ts so
// sensitive strings never leave the device. The server re-runs them as
// defense-in-depth.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const HEX_SECRET_RE = /\b[a-fA-F0-9]{32,}\b/g;
const MATRIX_TOKEN_RE = /\b(syt|syl|mat)_[A-Za-z0-9_+/=-]{16,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g;
const QS_SECRET_RE = /\b(password|token|secret|api[_-]?key|access[_-]?token)=([^&\s"']+)/gi;

const redact = (raw: string): string =>
    raw
        .replace(EMAIL_RE, '[redacted-email]')
        .replace(JWT_RE, '[redacted-jwt]')
        .replace(MATRIX_TOKEN_RE, '[redacted-matrix-token]')
        .replace(BEARER_RE, 'Bearer [redacted]')
        .replace(QS_SECRET_RE, '$1=[redacted]')
        .replace(HEX_SECRET_RE, '[redacted-hex]');

type ReportStatus = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; reportId: string } | { kind: 'error'; message: string };

interface IssueReportDialogProps {
    open: boolean;
    onClose: () => void;
}

export const IssueReportDialog: React.FC<IssueReportDialogProps> = ({ open, onClose }) => {
    const [description, setDescription] = useState('');
    const [includeContext, setIncludeContext] = useState(true);
    const [status, setStatus] = useState<ReportStatus>({ kind: 'idle' });

    useEffect(() => {
        if (!open) {
            // Reset on close so the next open is fresh.
            setDescription('');
            setStatus({ kind: 'idle' });
        }
    }, [open]);

    const context = useMemo(() => {
        if (!includeContext) return {};
        if (typeof window === 'undefined') return { appVersion: APP_VERSION };
        return {
            url: redact(window.location.href),
            userAgent: window.navigator?.userAgent,
            appVersion: APP_VERSION,
            buildChannel: (window as unknown as { __BLACKOUT_BUILD_CHANNEL__?: string }).__BLACKOUT_BUILD_CHANNEL__,
        };
    }, [includeContext]);

    const handleSubmit = async () => {
        if (!description.trim()) return;
        setStatus({ kind: 'sending' });
        trackSettingsInteraction('about', 'issue_report', 'submit');
        try {
            const body = {
                description: redact(description),
                ...context,
            };
            const token = readBlackoutApiToken();
            const json = (await createAuthorizedApiClient(token)({
                method: 'POST',
                path: '/v1/diagnostics/issue-report',
                body,
            })) as { reportId: string };
            setStatus({ kind: 'sent', reportId: json.reportId });
            trackSettingsInteraction('about', 'issue_report', 'success');
        } catch (err) {
            setStatus({ kind: 'error', message: (err as Error).message });
            trackSettingsInteraction('about', 'issue_report', 'error');
        }
    };

    if (!open) return null;

    return (
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="issue-report-title">
            <div style={dialogStyle}>
                <h3 id="issue-report-title" style={{ margin: 0 }}>Report an issue</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary, #9ca3af)', fontSize: 13 }}>
                    Tell us what went wrong. We attach a redacted snapshot of your current page, app
                    version, and user agent so we can reproduce the problem. Emails, JWTs, and access
                    tokens are removed before the report leaves your device.
                </p>

                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened? What did you expect?"
                    aria-label="Issue description"
                    style={textareaStyle}
                    disabled={status.kind === 'sending'}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                        type="checkbox"
                        checked={includeContext}
                        onChange={(e) => setIncludeContext(e.target.checked)}
                    />
                    Include app version and current page (recommended)
                </label>

                {status.kind === 'error' && (
                    <small style={{ color: 'var(--accent-danger, #b00020)' }}>
                        Could not send: {status.message}
                    </small>
                )}
                {status.kind === 'sent' && (
                    <small>Thanks — report submitted (id <code>{status.reportId}</code>).</small>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <a
                        href="https://github.com/Blackmarket-coa/blackout/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...buttonStyle, textDecoration: 'none' }}
                    >
                        Open GitHub instead
                    </a>
                    <button type="button" style={buttonStyle} onClick={onClose}>
                        {status.kind === 'sent' ? 'Close' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        style={primaryButtonStyle}
                        onClick={handleSubmit}
                        disabled={status.kind === 'sending' || status.kind === 'sent' || !description.trim()}
                    >
                        {status.kind === 'sending' ? 'Sending…' : 'Submit report'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IssueReportDialog;
