import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import {
    buildSelfHostCompose,
    buildSelfHostFilename,
    validateSelfHostInput,
    type SelfHostInput,
} from './composeTemplate';

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '20px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const formStyle: CSSProperties = {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const fieldRow: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const labelStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const inputStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    fontSize: 13,
};

const ctaStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const previewStyle: CSSProperties = {
    margin: '12px 16px 24px',
    padding: 12,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
    fontSize: 12,
    color: 'var(--text-primary, #f8fafc)',
    whiteSpace: 'pre-wrap',
    overflowX: 'auto',
    maxHeight: '60vh',
    overflowY: 'auto',
};

const errorStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-danger, #f87171)',
    fontSize: 13,
};

/**
 * `/federation/self-host` wizard (PR 8). Collects the minimum
 * configuration needed to render a per-canopy `docker-compose.yml`
 * that runs Synapse + Postgres + matrix-media-repo + Owncast on the
 * canopy admin's own server. Generation is purely client-side via
 * the pure `composeTemplate` module — no API.
 */
export const SelfHostWizard = (): JSX.Element => {
    const [input, setInput] = useState<SelfHostInput>({
        canopyId: '',
        domain: '',
        adminEmail: '',
        federationTier: 'global',
        includeOwncast: true,
    });

    const validation = useMemo(() => validateSelfHostInput(input), [input]);
    const preview = useMemo(() => {
        if (!validation.valid) return null;
        try {
            return buildSelfHostCompose(input);
        } catch {
            return null;
        }
    }, [input, validation.valid]);

    const handleChange = <K extends keyof SelfHostInput>(key: K, value: SelfHostInput[K]) => {
        setInput((prev) => ({ ...prev, [key]: value }));
    };

    const handleDownload = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!validation.valid || !preview) return;
        const blob = new Blob([preview], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = buildSelfHostFilename(input.canopyId);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Defer the URL revoke so Safari has a chance to issue the
        // download before the blob is collected.
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    };

    return (
        <section style={layoutStyle} data-shell-region="self-host-wizard">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Host your own {BLACKOUT_TERMS.canopy.singular}</h1>
                <p style={subStyle}>
                    Generate a docker-compose blueprint that runs your{' '}
                    {BLACKOUT_TERMS.canopy.singular}'s Synapse, media store, and optionally Owncast
                    on your own server.
                </p>
            </header>
            <form style={formStyle} onSubmit={handleDownload}>
                <div style={fieldRow}>
                    <label style={labelStyle} htmlFor="self-host-canopy">
                        Canopy id
                    </label>
                    <input
                        id="self-host-canopy"
                        style={inputStyle}
                        value={input.canopyId}
                        onChange={(event) => handleChange('canopyId', event.target.value)}
                        placeholder="mutual-aid-coop"
                        data-testid="self-host-canopy-input"
                    />
                </div>
                <div style={fieldRow}>
                    <label style={labelStyle} htmlFor="self-host-domain">
                        Public domain
                    </label>
                    <input
                        id="self-host-domain"
                        style={inputStyle}
                        value={input.domain}
                        onChange={(event) => handleChange('domain', event.target.value)}
                        placeholder="aid.example.coop"
                        data-testid="self-host-domain-input"
                    />
                </div>
                <div style={fieldRow}>
                    <label style={labelStyle} htmlFor="self-host-email">
                        Admin email
                    </label>
                    <input
                        id="self-host-email"
                        type="email"
                        style={inputStyle}
                        value={input.adminEmail}
                        onChange={(event) => handleChange('adminEmail', event.target.value)}
                        placeholder="ops@aid.example.coop"
                        data-testid="self-host-email-input"
                    />
                </div>
                <div style={fieldRow}>
                    <label style={labelStyle} htmlFor="self-host-tier">
                        Federation tier
                    </label>
                    <select
                        id="self-host-tier"
                        style={inputStyle}
                        value={input.federationTier ?? 'global'}
                        onChange={(event) =>
                            handleChange(
                                'federationTier',
                                event.target.value as SelfHostInput['federationTier']
                            )
                        }
                    >
                        <option value="local">local — no federation</option>
                        <option value="zone">zone — federate within zone</option>
                        <option value="global">global — federate to all</option>
                    </select>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="checkbox"
                        checked={input.includeOwncast ?? true}
                        onChange={(event) => handleChange('includeOwncast', event.target.checked)}
                    />
                    <span style={{ fontSize: 13 }}>Include Owncast for streaming</span>
                </label>
                {!validation.valid ? (
                    <p style={errorStyle} data-testid="self-host-validation-error">
                        {validation.errors.join(' · ')}
                    </p>
                ) : null}
                <button
                    type="submit"
                    style={ctaStyle}
                    disabled={!validation.valid}
                    data-testid="self-host-download-cta"
                >
                    Download docker-compose.yml
                </button>
            </form>
            {preview ? (
                <pre style={previewStyle} data-testid="self-host-preview">
                    {preview}
                </pre>
            ) : null}
        </section>
    );
};

export default SelfHostWizard;
