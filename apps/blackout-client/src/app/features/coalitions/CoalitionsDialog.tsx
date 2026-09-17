import React, { type CSSProperties } from 'react';
import { MyCoalitionsPanel } from './MyCoalitionsPanel';
import { buttonStyle } from './coalitionsStyles';

const OVERLAY_STYLE: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const CARD_STYLE: CSSProperties = {
    width: 'min(480px, 100%)',
    maxHeight: 'min(640px, 100%)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

/**
 * Modal chrome around {@link MyCoalitionsPanel}. Opened from the canopy member
 * panel header where the Friends dialog used to live.
 */
export const CoalitionsDialog = ({ onClose }: { onClose: () => void }) => (
    <div
        style={OVERLAY_STYLE}
        role="dialog"
        aria-modal="true"
        aria-label="Coalitions"
        data-testid="coalitions-dialog"
        onClick={onClose}
    >
        <div style={CARD_STYLE} onClick={(event) => event.stopPropagation()}>
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border-default)',
                }}
            >
                <strong style={{ fontSize: 16 }}>Coalitions</strong>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close coalitions"
                    data-testid="coalitions-close"
                    style={{ ...buttonStyle('subtle'), width: 30, height: 30, padding: 0 }}
                >
                    ✕
                </button>
            </header>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 16px 16px' }}>
                <MyCoalitionsPanel onNavigatedAway={onClose} />
            </div>
        </div>
    </div>
);

export default CoalitionsDialog;
