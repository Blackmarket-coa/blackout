import React from 'react';
import { LOCATION_DISCLOSURE, useLocationConsentFlow } from './locationConsent';
import { LocationConsentDialog } from './LocationConsentDialog';

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '8px 14px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

const listStyle: React.CSSProperties = {
    margin: 0,
    paddingLeft: 18,
    display: 'grid',
    gap: 4,
    fontSize: 13,
    color: 'var(--text-secondary)',
};

const formatGrantedAt = (grantedAt: number | null): string | null => {
    if (!grantedAt) return null;
    try {
        return new Date(grantedAt).toLocaleString();
    } catch {
        return null;
    }
};

/**
 * Persistent, always-discoverable control for location services inside Privacy
 * settings. It surfaces the current state, restates exactly what is retained
 * (so the viewer can review it any time, not just at the moment they opt in),
 * and offers the same two-step opt-in / one-tap revoke used elsewhere.
 */
export const LocationServicesSection: React.FC = () => {
    const consent = useLocationConsentFlow();
    const grantedAt = formatGrantedAt(consent.grantedAt);

    return (
        <section
            style={{
                display: 'grid',
                gap: 12,
                marginTop: 24,
                paddingTop: 20,
                borderTop: '1px solid var(--border-default)',
            }}
            data-testid="location-services-section"
        >
            <h3 style={{ margin: 0 }}>Location services</h3>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <strong data-testid="location-services-status">
                        {consent.granted ? 'On' : 'Off'}
                    </strong>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {consent.granted
                            ? grantedAt
                                ? `Turned on ${grantedAt}.`
                                : 'Turned on.'
                            : 'Off by default. Location is never collected until you turn it on.'}
                    </div>
                </div>
                {consent.granted ? (
                    <button
                        type="button"
                        data-testid="location-services-revoke"
                        style={buttonStyle}
                        onClick={consent.revoke}
                    >
                        Turn off location
                    </button>
                ) : (
                    <button
                        type="button"
                        data-testid="location-services-enable"
                        style={buttonStyle}
                        onClick={consent.requestEnable}
                    >
                        Turn on location…
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>What is kept</span>
                <ul style={listStyle}>
                    {LOCATION_DISCLOSURE.retention.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>

            <LocationConsentDialog
                open={consent.disclosureOpen}
                onConfirm={consent.confirmEnable}
                onCancel={consent.cancelEnable}
            />
        </section>
    );
};

export default LocationServicesSection;
