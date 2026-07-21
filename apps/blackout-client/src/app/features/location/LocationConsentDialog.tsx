import React, { useEffect, useState } from 'react';
import { LOCATION_DISCLOSURE } from './locationConsent';

export interface LocationConsentDialogProps {
    open: boolean;
    /** Step 2 — the viewer acknowledged and confirmed; grant consent. */
    onConfirm: () => void;
    /** The viewer backed out; leave location off. */
    onCancel: () => void;
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0,0,0,0.5)',
    display: 'grid',
    placeItems: 'center',
    padding: 16,
};

const cardStyle: React.CSSProperties = {
    width: 'min(460px, 100%)',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: 20,
    display: 'grid',
    gap: 14,
    boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
};

const listStyle: React.CSSProperties = {
    margin: 0,
    paddingLeft: 18,
    display: 'grid',
    gap: 4,
    fontSize: 13,
    color: 'var(--text-secondary)',
};

const sectionLabelStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
};

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '8px 14px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

/**
 * Two-step location opt-in. Step 1 is reading this disclosure; step 2 is
 * ticking "I understand" (which alone unlocks the confirm button) and then
 * pressing "Turn on location". Cancelling — via the button, the backdrop, or
 * Escape — leaves location off. The acknowledgement resets every time the
 * dialog reopens so consent is always a fresh, deliberate act.
 */
export const LocationConsentDialog: React.FC<LocationConsentDialogProps> = ({
    open,
    onConfirm,
    onCancel,
}) => {
    const [acknowledged, setAcknowledged] = useState(false);

    useEffect(() => {
        if (open) setAcknowledged(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    const confirm = () => {
        if (!acknowledged) return;
        onConfirm();
    };

    return (
        <div style={overlayStyle} data-testid="location-consent-overlay" onClick={onCancel}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="location-consent-title"
                data-testid="location-consent-dialog"
                style={cardStyle}
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id="location-consent-title" style={{ margin: 0, fontSize: 18 }}>
                    {LOCATION_DISCLOSURE.title}
                </h2>
                <p style={{ margin: 0, fontSize: 14 }}>{LOCATION_DISCLOSURE.summary}</p>

                <div style={{ display: 'grid', gap: 4 }}>
                    <p style={sectionLabelStyle}>What it powers</p>
                    <ul style={listStyle}>
                        {LOCATION_DISCLOSURE.uses.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>

                <div style={{ display: 'grid', gap: 4 }}>
                    <p style={sectionLabelStyle}>Effect on your anonymity</p>
                    <ul style={listStyle}>
                        {LOCATION_DISCLOSURE.anonymityEffects.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>

                <div style={{ display: 'grid', gap: 4 }}>
                    <p style={sectionLabelStyle}>What is kept</p>
                    <ul style={listStyle}>
                        {LOCATION_DISCLOSURE.retention.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>

                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                    <input
                        type="checkbox"
                        data-testid="location-consent-ack"
                        checked={acknowledged}
                        onChange={(event) => setAcknowledged(event.target.checked)}
                        style={{ marginTop: 2 }}
                    />
                    <span>
                        I understand how location affects my anonymity and what is kept, and I want
                        to turn location services on.
                    </span>
                </label>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        data-testid="location-consent-cancel"
                        style={buttonStyle}
                        onClick={onCancel}
                    >
                        Not now
                    </button>
                    <button
                        type="button"
                        data-testid="location-consent-confirm"
                        style={{
                            ...buttonStyle,
                            fontWeight: 600,
                            opacity: acknowledged ? 1 : 0.5,
                            cursor: acknowledged ? 'pointer' : 'not-allowed',
                            borderColor: acknowledged
                                ? 'var(--accent-primary, #1ABC9C)'
                                : 'var(--border-default)',
                        }}
                        aria-disabled={!acknowledged}
                        disabled={!acknowledged}
                        onClick={confirm}
                    >
                        Turn on location
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LocationConsentDialog;
