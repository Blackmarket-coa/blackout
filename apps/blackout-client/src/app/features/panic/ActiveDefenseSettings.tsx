import { useState } from 'react';
import { useActiveDefenseFeatures } from './useActiveDefenseFeatures';

type ActiveDefenseSettingsProps = {
    requestClose?: () => void;
};

const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
};

/**
 * Active-defense controls (OSS-manifest group G5). Enterprise-tier, defensive,
 * local-only canary/decoy primitives behind an explicit admin-consent
 * acknowledgement. Never default-on (ethics §4). The actual mint/generate calls
 * post to /v1/activedefense/* with `consent: true`; this surface gates the
 * affordance and records the operator acknowledgement.
 */
export function ActiveDefenseSettings({ requestClose }: ActiveDefenseSettingsProps = {}) {
    const defense = useActiveDefenseFeatures();
    const [consent, setConsent] = useState(false);

    const actionsEnabled = defense.enabled && consent;

    return (
        <section style={{ display: 'grid', gap: 12 }} data-testid="feature-toggle-active-defense">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Active defense · Canaries &amp; decoys</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Defensive, local-only deception primitives: mint canary tokens to embed in honeypot
                artifacts and generate clearly-synthetic decoy data. No offensive, retaliatory, or
                third-party-directed behavior ships. Enterprise tier with explicit admin consent.
            </p>

            {defense.enabled ? null : (
                <div style={sectionStyle}>
                    <strong>Enterprise tier required</strong>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                        Active defense is available on the Enterprise tier (current plan:{' '}
                        {defense.tier}).
                    </p>
                </div>
            )}

            <div style={sectionStyle}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                        type="checkbox"
                        data-testid="active-defense-consent"
                        checked={consent}
                        disabled={!defense.enabled}
                        onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>
                        I acknowledge these are defensive, local-only measures and consent to their
                        use on systems I control.
                    </span>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                        type="button"
                        data-testid="active-defense-mint-canary"
                        disabled={!actionsEnabled || !defense.canaryTokens}
                    >
                        Mint canary token
                    </button>
                    <button
                        type="button"
                        data-testid="active-defense-generate-decoy"
                        disabled={!actionsEnabled || !defense.decoyData}
                    >
                        Generate decoy data
                    </button>
                </div>
            </div>
        </section>
    );
}

export default ActiveDefenseSettings;
