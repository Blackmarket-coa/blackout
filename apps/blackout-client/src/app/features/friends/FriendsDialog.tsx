import { type CSSProperties } from 'react';
import { FriendsPanel, friendsButtonStyle } from './FriendsPanel';

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
 * Modal chrome around {@link FriendsPanel}. The list itself lives in the panel
 * so the canopies hub can render the same thing as a tab without a dialog.
 */
export const FriendsDialog = ({ onClose }: { onClose: () => void }) => (
    <div
        style={OVERLAY_STYLE}
        role="dialog"
        aria-modal="true"
        aria-label="Friends"
        data-testid="friends-dialog"
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
                <strong style={{ fontSize: 16 }}>Friends</strong>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close friends"
                    style={{ ...friendsButtonStyle('subtle'), width: 30, height: 30, padding: 0 }}
                >
                    ✕
                </button>
            </header>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 16px 16px' }}>
                <FriendsPanel onNavigatedAway={onClose} />
            </div>
        </div>
    </div>
);

export default FriendsDialog;
